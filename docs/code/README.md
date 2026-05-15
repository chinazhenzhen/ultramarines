# 代码练习 · 肌肉记忆

> 本目录为 **Code 模块** 占位区域，待按节奏沉淀算法 / 系统设计 / 工程实现三类内容。

---

## 目录结构（规划中）

```
docs/code/
├── README.md                  # 本文件 · 模块索引
├── algorithm/                 # 算法题 · 按类型分类
│   ├── 01-dynamic-programming.md
│   ├── 02-graph-traversal.md
│   ├── 03-binary-search.md
│   └── 04-system-design-problems.md
├── system-design/             # 系统设计题 · 典型场景
│   ├── 01-rate-limiter.md
│   ├── 02-distributed-id-generator.md
│   ├── 03-consistent-hashing.md
│   └── 04-message-queue-design.md
└── engineering/              # 工程实现 · Python / Go / K8s
    ├── 01-langgraph-custom-node.md
    ├── 02-pydantic-schema-validation.md
    └── 03-k8s-operator-skeleton.md
```

---

## 题目模板

每道题按以下结构书写（参考 Demo）：

```markdown
# {{题号}} · {{题目名称}}

## 1. 题目描述

{{清晰描述输入输出、约束条件}}

## 2. 思路分析

> 关键点：{{时间 / 空间复杂度 | 边界情况 | 核心洞察}}

## 3. 代码实现

```python
def solution({{params}}):
    """
    时间复杂度：O({{n}})
    空间复杂度：O({{n}})
    """
    # 核心逻辑
    pass
```

## 4. 复杂度分析

| 维度 | 复杂度 | 说明 |
|------|--------|------|
| 时间 | O({{}}) | {{关键操作分析}} |
| 空间 | O({{}}) | {{额外空间用途}} |

## 5. 追问扩展

- 如果数据量扩大到 100x 怎么办？
- 如果需要支持分布式呢？
- 如果要求 Exactly-Once 语义呢？

## 6. 相关题目

- [Related Problem A](./xx.md)
- [Related Problem B](./yy.md)
```

---

## 当前进度

| 分类 | 规划 | 完成 |
|------|------|------|
| 算法 | 15 题 | 0 |
| 系统设计 | 10 题 | 0 |
| 工程实现 | 8 题 | 0 |

---

## 待办

- [ ] 确定题库来源（LeetCode Hot100 / 面试真题 / 业务高频）
- [ ] 按遗忘曲线复习节奏（1d / 3d / 7d / 30d）安排刷题计划
- [ ] 补充 Python / Go 双语言版本
- [ ] 对接站点 reader.js 注册

---

> Code 模块接入方式：在 `reader.js` 的 `articles` 对象中注册文章 ID，在 `categoryGroups` 中添加分组，在 `app.js` 的 `paletteIndex` 中添加搜索索引。
