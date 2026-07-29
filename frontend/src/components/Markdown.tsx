"use client";

import { Fragment, type ReactNode } from "react";
import { safeHref } from "@/lib/url";

/** Renderer markdown tối giản (heading / bullet / ordered list / bold / code / link). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s)\]]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[1] && match[2]) {
      const href = safeHref(match[2]);
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {renderInline(match[1], key)}
          </a>
        ) : (
          // scheme không an toàn -> hiện dạng text, không tạo link
          <span key={key} title={match[2]}>
            {renderInline(match[1], key)}
          </span>
        ),
      );
    } else if (match[3]) {
      // bold có thể bọc link/code bên trong -> parse tiếp
      nodes.push(<strong key={key}>{renderInline(match[3], key)}</strong>);
    } else if (match[4]) {
      nodes.push(<code key={key}>{match[4]}</code>);
    } else if (match[5]) {
      const href = safeHref(match[5]);
      const label = match[5].length > 48 ? `${match[5].slice(0, 45)}…` : match[5];
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

type ListBuffer = { ordered: boolean; startAt: number; items: string[] };

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: ListBuffer | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const { ordered, startAt, items } = list;
    list = null;
    const children = items.map((item, index) => <li key={index}>{renderInline(item, `${key}-${index}`)}</li>);
    blocks.push(
      ordered ? (
        <ol key={key} start={startAt} className="list-decimal pl-5">
          {children}
        </ol>
      ) : (
        <ul key={key}>{children}</ul>
      ),
    );
  };

  lines.forEach((raw, lineIndex) => {
    const line = raw.trimEnd();
    const key = `b${lineIndex}`;
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);

    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const content = ordered ? ordered[2] : bullet![1];
      if (!list || list.ordered !== isOrdered) {
        flushList(`${key}-list`);
        list = { ordered: isOrdered, startAt: ordered ? Number(ordered[1]) : 1, items: [] };
      }
      list.items.push(content);
      return;
    }

    flushList(`${key}-list`);
    if (!line.trim()) return;
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const Tag = (["h1", "h2", "h3"] as const)[heading[1].length - 1];
      blocks.push(<Tag key={key}>{renderInline(heading[2], key)}</Tag>);
      return;
    }
    blocks.push(<p key={key}>{renderInline(line, key)}</p>);
  });
  flushList("tail-list");

  return (
    <div className={`md-body text-[13px] leading-relaxed text-mist-200 ${className}`}>
      {blocks.map((block, index) => (
        <Fragment key={index}>{block}</Fragment>
      ))}
    </div>
  );
}
