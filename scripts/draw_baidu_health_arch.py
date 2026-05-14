#!/usr/bin/env python3
"""Generate the bilingual Baidu Health medical-RAG architecture diagram."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "interview-baidu-health-architecture.png"
WIDTH_PX = 1672
HEIGHT_PX = 941
DPI = 100

# Set this before importing matplotlib so font caches are written somewhere safe.
os.environ.setdefault(
    "MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "ultramarines-matplotlib-cache")
)
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)
os.environ.setdefault(
    "XDG_CACHE_HOME", str(Path(tempfile.gettempdir()) / "ultramarines-xdg-cache")
)
Path(os.environ["XDG_CACHE_HOME"]).mkdir(parents=True, exist_ok=True)

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import (
    Circle,
    Ellipse,
    FancyArrowPatch,
    FancyBboxPatch,
    PathPatch,
    Polygon,
    Rectangle,
)
from matplotlib.path import Path as MplPath


FONT_CANDIDATES = [
    "PingFang SC",
    "Heiti SC",
    "Hiragino Sans GB",
    "Songti SC",
    "Arial Unicode MS",
    "Noto Sans CJK SC",
]

BG = "#FAF8F2"
TEXT = "#172636"
MUTED = "#526474"
ARROW = "#7FA88E"
BLUE_FILL = "#D6E6F2"
BLUE_ALT = "#E6F0F8"
BLUE_EDGE = "#5C8FCA"
GREEN_FILL = "#D4EBD8"
GREEN_ALT = "#E8F4EA"
GREEN_EDGE = "#5AA27D"
TEAL_FILL = "#E6F0F8"
TEAL_EDGE = "#519DA9"
GOLD_EDGE = "#D3A542"
KB_FILL = "#FFFDF5"
SHADOW = "#D8D0BE"


def choose_font() -> tuple[str, str]:
    available = {font.name: font.fname for font in font_manager.fontManager.ttflist}
    checked = []
    for name in FONT_CANDIDATES:
        checked.append(name)
        if name in available:
            print(f"Font selected: {name} ({available[name]})")
            print(f"Font fallback order checked: {', '.join(checked)}")
            return name, available[name]

    for name in FONT_CANDIDATES:
        needle = name.lower()
        for font in font_manager.fontManager.ttflist:
            if needle in font.name.lower() or needle in Path(font.fname).name.lower():
                print(f"Font selected: {font.name} ({font.fname})")
                print(f"Font fallback order checked: {', '.join(checked)}")
                return font.name, font.fname

    raise RuntimeError(
        "No CJK font found. Install one of: " + ", ".join(FONT_CANDIDATES)
    )


FONT_NAME, FONT_PATH = choose_font()
mpl.rcParams["font.family"] = [FONT_NAME, "DejaVu Sans"]
mpl.rcParams["font.sans-serif"] = [FONT_NAME, "DejaVu Sans"]
mpl.rcParams["axes.unicode_minus"] = False

FONT_REG = font_manager.FontProperties(fname=FONT_PATH)
FONT_BOLD = font_manager.FontProperties(fname=FONT_PATH, weight="bold")


def verify_cjk_glyphs() -> None:
    from matplotlib.ft2font import FT2Font

    required_chars = set(
        "用户提问意图识别规则混合检索稠密向量精排引用感知生成安全护栏医学知识库疾病药品临床指南"
    )
    charmap = FT2Font(FONT_PATH).get_charmap()
    missing = sorted(ch for ch in required_chars if ord(ch) not in charmap)
    if missing:
        raise RuntimeError(
            f"Selected font is missing required Chinese glyphs: {''.join(missing)} "
            f"({FONT_PATH})"
        )
    print(f"CJK glyph coverage verified: {FONT_PATH}")


def rounded_box(
    ax,
    x: float,
    y: float,
    w: float,
    h: float,
    face: str,
    edge: str,
    radius: float = 10,
    lw: float = 2.0,
    shadow: bool = True,
    z: int = 2,
) -> FancyBboxPatch:
    if shadow:
        ax.add_patch(
            FancyBboxPatch(
                (x + 4, y - 4),
                w,
                h,
                boxstyle=f"round,pad=0,rounding_size={radius}",
                facecolor=SHADOW,
                edgecolor="none",
                alpha=0.16,
                zorder=z - 1,
            )
        )
    box = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        facecolor=face,
        edgecolor=edge,
        linewidth=lw,
        zorder=z,
    )
    ax.add_patch(box)
    return box


def add_text(
    ax,
    x: float,
    y: float,
    text: str,
    size: float,
    color: str = TEXT,
    ha: str = "center",
    va: str = "center",
    weight: str = "regular",
    **kwargs,
) -> None:
    ax.text(
        x,
        y,
        text,
        fontsize=size,
        color=color,
        ha=ha,
        va=va,
        fontproperties=FONT_BOLD if weight == "bold" else FONT_REG,
        linespacing=1.12,
        **kwargs,
    )


def add_arrow(ax, start: tuple[float, float], end: tuple[float, float], scale=22) -> None:
    ax.add_patch(
        FancyArrowPatch(
            start,
            end,
            arrowstyle="-|>",
            mutation_scale=scale,
            linewidth=2.3,
            color=ARROW,
            shrinkA=4,
            shrinkB=4,
            zorder=4,
        )
    )


def draw_number(ax, x: float, y: float, n: int, color: str) -> None:
    ax.add_patch(Circle((x, y), 18, facecolor=color, edgecolor="white", linewidth=1.8, zorder=8))
    add_text(ax, x, y - 1, str(n), 16, "white", weight="bold", zorder=9)


def draw_person(ax, cx: float, cy: float, scale: float, fill: str, edge: str) -> None:
    ax.add_patch(Circle((cx, cy + 35 * scale), 22 * scale, facecolor=fill, edgecolor=edge, linewidth=2.0, zorder=5))
    ax.add_patch(
        FancyBboxPatch(
            (cx - 40 * scale, cy - 35 * scale),
            80 * scale,
            50 * scale,
            boxstyle=f"round,pad=0,rounding_size={18 * scale}",
            facecolor=fill,
            edgecolor=edge,
            linewidth=2.0,
            zorder=5,
        )
    )


def draw_chat_person(ax, x: float, y: float, w: float, h: float) -> None:
    fill = "#78AEE1"
    edge = "#2E5D92"
    draw_person(ax, x + w * 0.33, y + h * 0.36, 0.78, fill, edge)
    bubble_x, bubble_y = x + w * 0.51, y + h * 0.44
    ax.add_patch(
        FancyBboxPatch(
            (bubble_x, bubble_y),
            w * 0.37,
            h * 0.24,
            boxstyle="round,pad=0,rounding_size=11",
            facecolor="#F4FAFF",
            edgecolor=edge,
            linewidth=2.0,
            zorder=5,
        )
    )
    ax.add_patch(
        Polygon(
            [
                (bubble_x + w * 0.08, bubble_y),
                (bubble_x + w * 0.08, bubble_y - h * 0.08),
                (bubble_x + w * 0.18, bubble_y),
            ],
            closed=True,
            facecolor="#F4FAFF",
            edgecolor=edge,
            linewidth=2.0,
            zorder=5,
        )
    )
    for i in range(3):
        ax.add_patch(Circle((bubble_x + w * (0.11 + i * 0.075), bubble_y + h * 0.13), 4.0, facecolor=edge, edgecolor="none", zorder=6))


def draw_classifier(ax, x: float, y: float, w: float, h: float) -> None:
    edge = "#24694B"
    fill = "#9DD5B1"
    top = (x + w / 2, y + h * 0.68)
    mid = (x + w / 2, y + h * 0.42)
    left = (x + w * 0.25, y + h * 0.18)
    right = (x + w * 0.75, y + h * 0.18)
    ax.plot([top[0], mid[0]], [top[1], mid[1]], color=edge, lw=2.0, zorder=5)
    ax.plot([mid[0], left[0], left[0]], [mid[1], mid[1], left[1] + 18], color=edge, lw=2.0, zorder=5)
    ax.plot([mid[0], right[0], right[0]], [mid[1], mid[1], right[1] + 18], color=edge, lw=2.0, zorder=5)
    ax.add_patch(
        FancyBboxPatch(
            (top[0] - 12, top[1] - 13),
            24,
            26,
            boxstyle="round,pad=0,rounding_size=3",
            facecolor=fill,
            edgecolor=edge,
            linewidth=2.0,
            zorder=6,
        )
    )
    ax.add_patch(
        Polygon(
            [(mid[0], mid[1] + 18), (mid[0] + 18, mid[1]), (mid[0], mid[1] - 18), (mid[0] - 18, mid[1])],
            closed=True,
            facecolor=fill,
            edgecolor=edge,
            linewidth=2.0,
            zorder=6,
        )
    )
    for cx, cy in (left, right):
        ax.add_patch(
            FancyBboxPatch(
                (cx - 13, cy - 13),
                26,
                26,
                boxstyle="round,pad=0,rounding_size=3",
                facecolor=fill,
                edgecolor=edge,
                linewidth=2.0,
                zorder=6,
            )
        )


def draw_database(ax, cx: float, cy: float, scale: float, edge: str, fill: str = "#EAF6F2") -> None:
    ax.add_patch(Rectangle((cx - 22 * scale, cy - 28 * scale), 44 * scale, 56 * scale, facecolor=fill, edgecolor=edge, linewidth=1.9, zorder=5))
    ax.add_patch(Ellipse((cx, cy + 28 * scale), 44 * scale, 15 * scale, facecolor=fill, edgecolor=edge, linewidth=1.9, zorder=6))
    ax.add_patch(Ellipse((cx, cy), 44 * scale, 15 * scale, facecolor="none", edgecolor=edge, linewidth=1.5, zorder=6))
    ax.add_patch(Ellipse((cx, cy - 28 * scale), 44 * scale, 15 * scale, facecolor=fill, edgecolor=edge, linewidth=1.9, zorder=6))


def draw_hybrid(ax, x: float, y: float, w: float, h: float) -> None:
    edge = "#2C7781"
    inner_fill = "#F6FCFC"
    for row_y in (y + h * 0.52, y + h * 0.13):
        rounded_box(ax, x + 12, row_y, w - 24, h * 0.31, inner_fill, "#91C3C9", radius=10, lw=1.5, shadow=False, z=4)

    for label, tag_y, tag_w, font_size in (
        ("BM25", y + h * 0.80, 62, 10.8),
        ("Dense embedding", y + h * 0.41, 124, 9.4),
    ):
        rounded_box(ax, x + (w - tag_w) / 2, tag_y, tag_w, 27, "#5BAAB0", "#5BAAB0", radius=7, lw=1, shadow=False, z=7)
        add_text(ax, x + w / 2, tag_y + 13.2, label, font_size, "white", weight="bold", zorder=8)

    # BM25 row: magnifier to database.
    mx, my = x + w * 0.26, y + h * 0.66
    ax.add_patch(Circle((mx, my), 17, facecolor="#F6FCFC", edgecolor=edge, linewidth=2.3, zorder=6))
    ax.plot([mx + 12, mx + 27], [my - 12, my - 27], color=edge, lw=4, solid_capstyle="round", zorder=6)
    ax.plot([x + w * 0.41, x + w * 0.67], [my, my], color=edge, lw=1.6, ls=(0, (4, 4)), zorder=6)
    draw_database(ax, x + w * 0.80, my, 0.82, edge)

    # Dense row: small vector network to database.
    ny = y + h * 0.27
    points = [
        (x + w * 0.22, ny + 25),
        (x + w * 0.18, ny),
        (x + w * 0.24, ny - 25),
        (x + w * 0.32, ny + 18),
        (x + w * 0.36, ny - 18),
    ]
    for a, b in ((0, 1), (1, 2), (1, 3), (2, 4), (3, 4)):
        ax.plot([points[a][0], points[b][0]], [points[a][1], points[b][1]], color=edge, lw=1.8, zorder=6)
    for px, py in points:
        ax.add_patch(Circle((px, py), 6, facecolor="#CBE8E5", edgecolor=edge, linewidth=1.6, zorder=7))
    ax.plot([x + w * 0.43, x + w * 0.67], [ny, ny], color=edge, lw=1.6, ls=(0, (4, 4)), zorder=6)
    draw_database(ax, x + w * 0.81, ny, 0.82, edge)


def draw_document(ax, x: float, y: float, w: float, h: float, edge: str) -> None:
    ax.add_patch(Rectangle((x, y), w, h, facecolor="#F7FBFF", edgecolor=edge, linewidth=1.5, zorder=5))
    ax.add_patch(
        Polygon(
            [(x + w * 0.66, y + h), (x + w, y + h * 0.66), (x + w, y + h),],
            closed=True,
            facecolor="#DCEBFA",
            edgecolor=edge,
            linewidth=1.2,
            zorder=6,
        )
    )
    for i in range(3):
        yy = y + h * (0.27 + i * 0.20)
        ax.plot([x + 6, x + w - 7], [yy, yy], color=edge, lw=1.2, zorder=6)


def draw_reranker(ax, x: float, y: float, w: float, h: float) -> None:
    edge = "#2F629D"
    for i in range(4):
        draw_document(ax, x + w * 0.12, y + h * (0.18 + i * 0.19), 24, 34, edge)
        yy = y + h * (0.24 + i * 0.19)
        ax.plot([x + w * 0.32, x + w * 0.50], [yy, yy], color=edge, lw=3, solid_capstyle="round", zorder=6)
    flows = [
        ((x + w * 0.56, y + h * 0.80), (x + w * 0.80, y + h * 0.26)),
        ((x + w * 0.56, y + h * 0.61), (x + w * 0.78, y + h * 0.58)),
        ((x + w * 0.56, y + h * 0.41), (x + w * 0.80, y + h * 0.75)),
        ((x + w * 0.56, y + h * 0.22), (x + w * 0.79, y + h * 0.50)),
    ]
    for start, end in flows:
        ax.add_patch(
            FancyArrowPatch(
                start,
                end,
                arrowstyle="-|>",
                mutation_scale=15,
                linewidth=1.6,
                color=edge,
                connectionstyle="arc3,rad=0",
                zorder=6,
            )
        )
    for yy in (y + h * 0.76, y + h * 0.56, y + h * 0.34):
        ax.plot([x + w * 0.78, x + w * 0.96], [yy, yy], color=edge, lw=3, solid_capstyle="round", zorder=6)


def draw_generator(ax, x: float, y: float, w: float, h: float) -> None:
    edge = "#20683E"
    doc = FancyBboxPatch(
        (x + w * 0.22, y + h * 0.18),
        w * 0.50,
        h * 0.58,
        boxstyle="round,pad=0,rounding_size=8",
        facecolor="#F7FFF9",
        edgecolor=edge,
        linewidth=2.0,
        zorder=5,
    )
    ax.add_patch(doc)
    for i, ln in enumerate((0.28, 0.42, 0.56, 0.70)):
        ax.plot(
            [x + w * 0.31, x + w * (0.52 + (i % 2) * 0.08)],
            [y + h * ln, y + h * ln],
            color=edge,
            lw=2.1,
            zorder=6,
        )
    add_text(ax, x + w * 0.47, y + h * 0.30, "[1] [2] [3]", 14, "#2D7E50", weight="bold", zorder=6)
    ax.add_patch(Circle((x + w * 0.73, y + h * 0.66), 28, facecolor="#DDF1E6", edgecolor=edge, linewidth=2.0, zorder=6))
    add_text(ax, x + w * 0.73, y + h * 0.655, "“”", 29, edge, weight="bold", zorder=7)


def draw_shield(ax, x: float, y: float, w: float, h: float) -> None:
    edge = "#3A855B"
    verts = [
        (x + w * 0.50, y + h * 0.83),
        (x + w * 0.73, y + h * 0.70),
        (x + w * 0.80, y + h * 0.40),
        (x + w * 0.50, y + h * 0.06),
        (x + w * 0.20, y + h * 0.40),
        (x + w * 0.27, y + h * 0.70),
    ]
    ax.add_patch(
        Polygon(
            verts,
            closed=True,
            facecolor="#DFF1E5",
            edgecolor=edge,
            linewidth=4.0,
            zorder=5,
        )
    )
    ax.plot(
        [x + w * 0.37, x + w * 0.48, x + w * 0.67],
        [y + h * 0.47, y + h * 0.34, y + h * 0.58],
        color=edge,
        lw=5,
        solid_capstyle="round",
        solid_joinstyle="round",
        zorder=6,
    )


def draw_heart(ax, cx: float, cy: float, scale: float) -> None:
    edge = "#347C58"
    t = MplPath(
        [
            (cx, cy - 36 * scale),
            (cx - 55 * scale, cy + 8 * scale),
            (cx - 34 * scale, cy + 52 * scale),
            (cx, cy + 28 * scale),
            (cx + 34 * scale, cy + 52 * scale),
            (cx + 55 * scale, cy + 8 * scale),
            (cx, cy - 36 * scale),
        ],
        [
            MplPath.MOVETO,
            MplPath.CURVE4,
            MplPath.CURVE4,
            MplPath.CURVE4,
            MplPath.CURVE4,
            MplPath.CURVE4,
            MplPath.CURVE4,
        ],
    )
    ax.add_patch(PathPatch(t, facecolor="#64AA83", edgecolor=edge, linewidth=2.0, alpha=0.96, zorder=5))
    xs = [cx - 33 * scale, cx - 16 * scale, cx - 6 * scale, cx + 6 * scale, cx + 17 * scale, cx + 36 * scale]
    ys = [cy - 3 * scale, cy - 3 * scale, cy + 22 * scale, cy - 24 * scale, cy - 4 * scale, cy - 4 * scale]
    ax.plot(xs, ys, color="white", lw=4.0, solid_capstyle="round", solid_joinstyle="round", zorder=6)


def draw_capsule(ax, cx: float, cy: float, scale: float) -> None:
    edge = "#236C76"
    angle = 45
    ax.add_patch(
        FancyBboxPatch(
            (cx - 55 * scale, cy - 20 * scale),
            110 * scale,
            40 * scale,
            boxstyle=f"round,pad=0,rounding_size={20 * scale}",
            facecolor="#ECFBFD",
            edgecolor=edge,
            linewidth=2.2,
            zorder=5,
            mutation_aspect=1,
            transform=mpl.transforms.Affine2D().rotate_deg_around(cx, cy, angle) + ax.transData,
        )
    )
    ax.add_patch(
        Rectangle(
            (cx, cy - 20 * scale),
            55 * scale,
            40 * scale,
            facecolor="#88C6C3",
            edgecolor=edge,
            linewidth=2.2,
            zorder=6,
            transform=mpl.transforms.Affine2D().rotate_deg_around(cx, cy, angle) + ax.transData,
        )
    )


def draw_book(ax, cx: float, cy: float, scale: float) -> None:
    edge = "#236C76"
    ax.add_patch(
        FancyBboxPatch(
            (cx - 62 * scale, cy - 38 * scale),
            56 * scale,
            76 * scale,
            boxstyle="round,pad=0,rounding_size=6",
            facecolor="#EAF9F6",
            edgecolor=edge,
            linewidth=2.2,
            zorder=5,
        )
    )
    ax.add_patch(
        FancyBboxPatch(
            (cx + 6 * scale, cy - 38 * scale),
            56 * scale,
            76 * scale,
            boxstyle="round,pad=0,rounding_size=6",
            facecolor="#EAF9F6",
            edgecolor=edge,
            linewidth=2.2,
            zorder=5,
        )
    )
    ax.plot([cx, cx], [cy - 36 * scale, cy + 36 * scale], color=edge, lw=2.0, zorder=6)
    for side in (-1, 1):
        for offset in (-18, 0, 18):
            ax.plot(
                [cx + side * 18 * scale, cx + side * 45 * scale],
                [cy + offset * scale, cy + (offset - 3) * scale],
                color=edge,
                lw=1.8,
                zorder=6,
            )
    add_text(ax, cx + 43 * scale, cy + 12 * scale, "+", 35, "#4BA6A7", weight="bold", zorder=7)


def draw_card(ax, card: dict) -> None:
    x, y, w, h = card["x"], card["y"], card["w"], card["h"]
    rounded_box(ax, x, y, w, h, card["fill"], card["edge"], radius=14, lw=2.0, z=2)
    draw_number(ax, x + 28, y + h - 28, card["n"], card["num"])

    icon_x = x + 14
    icon_y = y + 82
    icon_w = w - 28
    icon_h = 91
    card["icon"](ax, icon_x, icon_y, icon_w, icon_h)

    title_y = y + (55 if "\n" in card["title"] else 52)
    add_text(
        ax,
        x + w / 2,
        title_y,
        card["title"],
        13.6 if "\n" in card["title"] else 14.2,
        weight="bold",
        va="center",
        zorder=6,
    )
    add_text(ax, x + w / 2, y + 22, card["subtitle"], 11.2, color=MUTED, weight="regular", zorder=6)


def draw_medical_kb(ax, card3_center: float, card3_bottom: float) -> None:
    w, h = 640, 240
    x, y = card3_center - w / 2, 150
    rounded_box(ax, x, y, w, h, KB_FILL, GOLD_EDGE, radius=14, lw=1.8, shadow=False, z=2)

    badge_cx, badge_cy = x + w / 2, y + h - 30
    ax.add_patch(Circle((badge_cx, badge_cy), 18, facecolor="#E8F4EA", edgecolor="#347C58", linewidth=1.8, zorder=5))
    ax.plot(
        [badge_cx - 11, badge_cx - 5, badge_cx, badge_cx + 5, badge_cx + 11],
        [badge_cy, badge_cy, badge_cy + 9, badge_cy - 9, badge_cy - 9],
        color="#347C58",
        lw=2.3,
        solid_capstyle="round",
        solid_joinstyle="round",
        zorder=6,
    )
    add_text(ax, x + w / 2, y + h - 68, "Medical Knowledge Base", 19, weight="bold", zorder=6)
    add_text(ax, x + w / 2, y + h - 96, "医学知识库", 13.5, color=MUTED, zorder=6)
    add_arrow(ax, (card3_center, y + h + 2), (card3_center, card3_bottom - 2), scale=21)

    col_w = w / 3
    for i in (1, 2):
        sx = x + col_w * i
        ax.plot([sx, sx], [y + 42, y + h - 116], color="#D7C894", lw=1.4, zorder=4)

    items = [
        ("disease", "疾病", draw_heart),
        ("drug", "药品", draw_capsule),
        ("clinical guidelines", "临床指南", draw_book),
    ]
    for idx, (en, zh, icon) in enumerate(items):
        cx = x + col_w * (idx + 0.5)
        icon(ax, cx, y + 88, 0.62)
        add_text(ax, cx, y + 42, en, 13.4, weight="regular", zorder=6)
        add_text(ax, cx, y + 21, zh, 11.7, color=MUTED, zorder=6)


def main() -> None:
    verify_cjk_glyphs()

    fig = plt.figure(figsize=(WIDTH_PX / DPI, HEIGHT_PX / DPI), dpi=DPI, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, WIDTH_PX)
    ax.set_ylim(0, HEIGHT_PX)
    ax.set_facecolor(BG)
    ax.axis("off")

    card_w = 214
    card_h = 200
    gap = 24
    start_x = (WIDTH_PX - (7 * card_w + 6 * gap)) / 2
    card_y = 530

    cards = [
        {
            "n": 1,
            "title": "User Query",
            "subtitle": "用户提问",
            "fill": BLUE_FILL,
            "edge": BLUE_EDGE,
            "num": "#78AEE1",
            "icon": draw_chat_person,
        },
        {
            "n": 2,
            "title": "Intent Classifier\n(rule + LLM)",
            "subtitle": "意图识别（规则 + LLM）",
            "fill": GREEN_ALT,
            "edge": GREEN_EDGE,
            "num": "#71B28C",
            "icon": draw_classifier,
        },
        {
            "n": 3,
            "title": "Hybrid Retrieval\n(BM25 + Dense)",
            "subtitle": "混合检索（BM25 + 稠密向量）",
            "fill": TEAL_FILL,
            "edge": TEAL_EDGE,
            "num": "#62ACB7",
            "icon": draw_hybrid,
        },
        {
            "n": 4,
            "title": "BGE Reranker",
            "subtitle": "BGE 精排",
            "fill": BLUE_ALT,
            "edge": BLUE_EDGE,
            "num": "#78AEE1",
            "icon": draw_reranker,
        },
        {
            "n": 5,
            "title": "Citation-aware\nLLM Generator",
            "subtitle": "引用感知生成",
            "fill": GREEN_ALT,
            "edge": GREEN_EDGE,
            "num": "#71B28C",
            "icon": draw_generator,
        },
        {
            "n": 6,
            "title": "Safety Gate",
            "subtitle": "安全护栏",
            "fill": GREEN_FILL,
            "edge": GREEN_EDGE,
            "num": "#71B28C",
            "icon": draw_shield,
        },
        {
            "n": 7,
            "title": "User",
            "subtitle": "用户",
            "fill": BLUE_FILL,
            "edge": BLUE_EDGE,
            "num": "#78AEE1",
            "icon": lambda ax, x, y, w, h: draw_person(ax, x + w / 2, y + h * 0.43, 1.0, "#78AEE1", "#2E5D92"),
        },
    ]

    for idx, card in enumerate(cards):
        card["x"] = start_x + idx * (card_w + gap)
        card["y"] = card_y
        card["w"] = card_w
        card["h"] = card_h
        draw_card(ax, card)

    for left, right in zip(cards, cards[1:]):
        add_arrow(
            ax,
            (left["x"] + card_w + 2, card_y + card_h * 0.54),
            (right["x"] - 2, card_y + card_h * 0.54),
        )

    card3 = cards[2]
    draw_medical_kb(ax, card3["x"] + card_w / 2, card_y)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT, dpi=DPI, facecolor=BG, pad_inches=0)
    plt.close(fig)

    try:
        from PIL import Image

        with Image.open(OUTPUT) as image:
            size = image.size
        if size != (WIDTH_PX, HEIGHT_PX):
            raise RuntimeError(f"Unexpected output size: {size}, expected {(WIDTH_PX, HEIGHT_PX)}")
        print(f"Wrote {OUTPUT.relative_to(ROOT)} at {size[0]}x{size[1]} px")
    except ImportError:
        print(f"Wrote {OUTPUT.relative_to(ROOT)}; install Pillow to verify dimensions in-script")

    print("OK_DIAGRAM_REGENERATED")


if __name__ == "__main__":
    main()
