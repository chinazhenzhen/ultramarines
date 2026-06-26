# 01 · 限流器：Token Bucket 与 Sliding Window

> 目标：能手写单机限流器，并讲清它如何扩展到 Redis / 多租户 / 模型调用限流。

## 1. 题目描述

实现两个限流器：

- Token Bucket：每秒补充固定 token，允许短时突发。
- Sliding Window：统计最近窗口内请求数，限制更平滑。

要求：

- 支持 `allow(key, now)`。
- 能按 user / project / model 组合 key 限流。
- 能说明分布式实现思路。

## 2. 思路分析

Token Bucket 适合允许 burst：

```text
capacity = 10
refill_rate = 2 tokens/sec
每个请求消耗 1 token
```

Sliding Window 适合严格控制最近窗口：

```text
window = 60 sec
limit = 100 requests
只统计 now - 60s 之后的请求
```

## 3. Token Bucket 代码

```python
from __future__ import annotations

from dataclasses import dataclass
from time import monotonic


@dataclass
class Bucket:
    tokens: float
    updated_at: float


class TokenBucketLimiter:
    def __init__(self, capacity: int, refill_per_sec: float) -> None:
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self.buckets: dict[str, Bucket] = {}

    def allow(self, key: str, now: float | None = None, cost: float = 1) -> bool:
        now = monotonic() if now is None else now
        bucket = self.buckets.get(key)
        if bucket is None:
            bucket = Bucket(tokens=float(self.capacity), updated_at=now)

        elapsed = max(0.0, now - bucket.updated_at)
        bucket.tokens = min(self.capacity, bucket.tokens + elapsed * self.refill_per_sec)
        bucket.updated_at = now

        if bucket.tokens < cost:
            self.buckets[key] = bucket
            return False

        bucket.tokens -= cost
        self.buckets[key] = bucket
        return True
```

## 4. Sliding Window 代码

```python
from collections import defaultdict, deque
from time import monotonic


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_sec: float) -> None:
        self.limit = limit
        self.window_sec = window_sec
        self.events: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = monotonic() if now is None else now
        q = self.events[key]
        boundary = now - self.window_sec

        while q and q[0] <= boundary:
            q.popleft()

        if len(q) >= self.limit:
            return False

        q.append(now)
        return True
```

## 5. 多维 key 设计

```python
def rate_limit_key(user_id: str, project_id: str, model: str) -> str:
    return f"user:{user_id}:project:{project_id}:model:{model}"
```

常见限流层级：

| 层级 | 例子 | 目的 |
|---|---|---|
| user | `user:123` | 防止单用户滥用 |
| project | `project:ads` | 控制团队预算 |
| model | `model:gpt-4.1` | 保护昂贵模型 |
| endpoint | `endpoint:/runs` | 保护具体接口 |

一次请求要同时通过多级限流：

```python
def allow_request(limiters: list[TokenBucketLimiter], keys: list[str]) -> bool:
    return all(limiter.allow(key) for limiter, key in zip(limiters, keys))
```

生产上需要“预检查 + 原子扣减”，不能简单 all 后再扣多个 bucket，否则部分扣减失败会导致状态不一致。

## 6. 分布式实现

Redis Token Bucket 通常用 Lua 保证原子性：

```lua
-- KEYS[1] bucket key
-- ARGV[1] capacity
-- ARGV[2] refill_per_sec
-- ARGV[3] now
-- ARGV[4] cost
local bucket = redis.call("HMGET", KEYS[1], "tokens", "updated_at")
local tokens = tonumber(bucket[1]) or tonumber(ARGV[1])
local updated_at = tonumber(bucket[2]) or tonumber(ARGV[3])
local elapsed = math.max(0, tonumber(ARGV[3]) - updated_at)
tokens = math.min(tonumber(ARGV[1]), tokens + elapsed * tonumber(ARGV[2]))
if tokens < tonumber(ARGV[4]) then
  redis.call("HMSET", KEYS[1], "tokens", tokens, "updated_at", ARGV[3])
  redis.call("EXPIRE", KEYS[1], 3600)
  return 0
end
tokens = tokens - tonumber(ARGV[4])
redis.call("HMSET", KEYS[1], "tokens", tokens, "updated_at", ARGV[3])
redis.call("EXPIRE", KEYS[1], 3600)
return 1
```

## 7. 复杂度分析

| 算法 | 时间 | 空间 | 特点 |
|---|---|---|---|
| Token Bucket | O(1) | O(k) | 支持突发，请求历史不保存 |
| Sliding Window | O(m) 清理过期事件 | O(k * limit) | 更精确，但空间更高 |

`k` 是 key 数量，`m` 是本次清理的过期事件数。

## 8. 易错点

- 使用系统时间 `time.time()`，遇到时钟回拨；单机用 `monotonic()` 更稳。
- 多级限流非原子扣减，导致一部分 bucket 被扣。
- Redis 实现不用 Lua，读改写之间有竞态。
- key 维度过细导致内存膨胀，没有 TTL。
- 只限制 QPS，不限制 token / cost / 并发 run。

## 9. 追问扩展

- LLM 平台应按什么限流？请求数、并发 run、token/min、cost/day。
- 被限流返回什么？HTTP 429 + retry_after + 当前限制维度。
- 如何做排队？高价值任务入队，低优先级直接拒绝或降级。
- 如何观测？按 key 维度记录 allowed/rejected、剩余 token、等待时间。

## 10. 面试口播

> 如果要支持突发，我用 token bucket；如果要严格限制最近一分钟次数，我用 sliding window。单机实现用 map 保存每个 key 的状态，生产分布式用 Redis Lua 保证读改写原子性。LLM 平台不能只限 QPS，还要限并发 run、token/min 和 cost/day，并按 user、project、model 多维 key 组合。
