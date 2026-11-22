#!/usr/bin/env python3
"""Merge multiple electron-builder update-feed YAML files into one.

electron-builder 会为每个平台/架构产出独立的更新 feed：
  Windows      -> latest.yml
  Linux x64    -> latest-linux.yml
  Linux arm64  -> latest-linux-arm64.yml
  macOS        -> latest-mac.yml（x64 与 arm64 同名）

macOS 的 electron-updater（MacUpdater）只读取单一 latest-mac.yml，并按文件名里
是否含 "arm64" 过滤架构；而本仓库把 mac 拆成 x64 / arm64 两个 job 各自打包，会
各自产出一份同名 latest-mac.yml。因此需要把它们合并成一份，把两侧的 files 数组
取并集（按 url 去重），这样 x64 与 arm64 客户端都能在同一个 feed 里找到各自产物。

用法:
    merge_update_feeds.py <feed1.yml> <feed2.yml> ...  > merged.yml

实现刻意不依赖 PyYAML：electron-builder 生成的 feed 结构固定（version / files /
path / sha512 / releaseDate），这里只做「保留 version 行 + 合并 files 区块 +
原样保留其余顶层键」，并按行的缩进切分，因此对 sha512 等被 js-yaml 折行的长标量
也能正确处理。
"""

import sys


def split_feed(path):
    """把一份 feed 拆成 (version 行, files 区块原始行, 其余顶层原始行)。"""
    version_line = None
    files_lines = []
    tail_lines = []
    state = 'head'
    with open(path, encoding='utf-8-sig') as fh:
        for raw in fh:
            line = raw.rstrip('\n')
            if line == '':
                continue
            if state == 'head':
                if line == 'files:':
                    state = 'files'
                elif line.startswith('version:'):
                    version_line = line
                else:
                    tail_lines.append(line)
            elif state == 'files':
                if line.startswith(' '):
                    files_lines.append(line)
                else:  # 顶格行 => files 区块结束，进入尾部顶层键
                    state = 'tail'
                    tail_lines.append(line)
            else:
                tail_lines.append(line)
    return version_line, files_lines, tail_lines


def split_entries(files_lines):
    """把 files 区块按 `  - url:` 拆成若干条目（每条含其续行）。"""
    entries = []
    cur = None
    for line in files_lines:
        if line.startswith('  - url:'):
            if cur is not None:
                entries.append(cur)
            cur = [line]
        elif cur is not None:
            cur.append(line)
    if cur is not None:
        entries.append(cur)
    return entries


def entry_url(entry):
    return entry[0].split('url:', 1)[1].strip()


def merge(paths):
    version_line = None
    tail_lines = None
    seen = {}
    order = []
    for path in paths:
        version, files_lines, tails = split_feed(path)
        if version_line is None:
            version_line = version
        if tail_lines is None:
            tail_lines = tails
        for entry in split_entries(files_lines):
            url = entry_url(entry)
            if url not in seen:
                seen[url] = entry
                order.append(url)

    out = []
    if version_line is not None:
        out.append(version_line)
    out.append('files:')
    for url in order:
        out.extend(seen[url])
    out.extend(tail_lines or [])
    return '\n'.join(out) + '\n'


def main(argv):
    if len(argv) < 2:
        sys.stderr.write('usage: merge_update_feeds.py <feed.yml> [feed.yml ...]\n')
        return 2
    sys.stdout.write(merge(argv[1:]))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
