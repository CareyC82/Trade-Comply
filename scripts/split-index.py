#!/usr/bin/env python3
"""Split index.html into css/, js/, and a slim index.html."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_PATH = ROOT / "index.html"

JS_SPLITS = [
    ("js/core.js", 1556, 1968),
    ("js/data.js", 1969, 2183),
    ("js/search.js", 2185, 2424),
    ("js/precheck.js", 2426, 2884),
    ("js/render.js", 2886, 3050),
    ("js/ai.js", 3052, 3217),
    ("js/navigation.js", 3219, 3534),
    ("js/semiconductor.js", 3536, 3610),
    ("js/incoterm.js", 3612, 3758),
    ("js/main.js", 3760, 3773),
]


def dedent_block(block_lines):
    dedented = []
    for line in block_lines:
        if line.startswith("        "):
            dedented.append(line[8:])
        elif line.strip() == "":
            dedented.append("\n")
        else:
            dedented.append(line)
    return dedented


def main():
    lines = HTML_PATH.read_text(encoding="utf-8").splitlines(keepends=True)

    style_start = next(i for i, line in enumerate(lines) if line.strip() == "<style>")
    style_end = next(i for i, line in enumerate(lines) if line.strip() == "</style>")
    script_start = next(i for i, line in enumerate(lines) if line.strip() == "<script>")
    script_end = next(i for i, line in enumerate(lines) if line.strip() == "</script>")

    css_dir = ROOT / "css"
    js_dir = ROOT / "js"
    css_dir.mkdir(exist_ok=True)
    js_dir.mkdir(exist_ok=True)

    css_lines = dedent_block(lines[style_start + 1 : style_end])
    (css_dir / "main.css").write_text("".join(css_lines), encoding="utf-8")

    for rel_path, start_line, end_line in JS_SPLITS:
        block = dedent_block(lines[start_line - 1 : end_line])
        (ROOT / rel_path).write_text("".join(block), encoding="utf-8")

    head = lines[:style_start]
    body_middle = lines[style_end + 1 : script_start]
    tail = lines[script_end + 1 :]

    script_tags = "\n".join(
        [
            '    <script src="js/core.js"></script>',
            '    <script src="js/data.js"></script>',
            '    <script src="js/search.js"></script>',
            '    <script src="js/precheck.js"></script>',
            '    <script src="js/render.js"></script>',
            '    <script src="js/ai.js"></script>',
            '    <script src="js/navigation.js"></script>',
            '    <script src="js/semiconductor.js"></script>',
            '    <script src="js/incoterm.js"></script>',
            '    <script src="js/main.js"></script>',
            "",
        ]
    )

    new_html = []
    new_html.extend(head)
    new_html.append('    <link rel="stylesheet" href="css/main.css">\n')
    new_html.extend(body_middle)
    new_html.append(script_tags)
    new_html.extend(tail)

    HTML_PATH.write_text("".join(new_html), encoding="utf-8")
    print("Split complete.")
    print(f"  css/main.css: {len(css_lines)} lines")
    for rel_path, start_line, end_line in JS_SPLITS:
        print(f"  {rel_path}: {end_line - start_line + 1} lines")


if __name__ == "__main__":
    main()
