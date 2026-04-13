'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import type { Editor } from '@tiptap/react';
import type { FieldComponentProps } from './field-props';

/* ── Strip HTML helper (SSR-safe) ── */
function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent ?? '';
  }
  // Regex fallback for SSR
  return html.replace(/<[^>]*>/g, '');
}

/* ── Inline SVG toolbar icons (lucide-style, 16×16) ── */
const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function BoldIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg {...iconProps}>
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function Heading2Icon() {
  return (
    <svg {...iconProps}>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg {...iconProps}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg {...iconProps}>
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </svg>
  );
}

function BlockquoteIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/* ── Toolbar ── */
interface ToolbarProps {
  editor: Editor;
}

function Toolbar({ editor }: ToolbarProps) {
  const btnBase = 'p-1.5 rounded text-sm';
  const activeClass = 'bg-primary/10 text-primary';
  const inactiveClass = 'text-muted-foreground hover:bg-muted';

  function btn(isActive: boolean) {
    return `${btnBase} ${isActive ? activeClass : inactiveClass}`;
  }

  function handleLink() {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('URL');
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }

  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1 flex-wrap">
      <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
        <BoldIcon />
      </button>
      <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
        <ItalicIcon />
      </button>
      <button
        type="button"
        className={btn(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2Icon />
      </button>
      <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">
        <BulletListIcon />
      </button>
      <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered List">
        <OrderedListIcon />
      </button>
      <button type="button" className={btn(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
        <BlockquoteIcon />
      </button>
      <button type="button" className={btn(editor.isActive('link'))} onClick={handleLink} title="Link">
        <LinkIcon />
      </button>
    </div>
  );
}

/* ── RichTextField ── */
export default function RichTextField({ field: _field, value, onChange, disabled, error, mode }: FieldComponentProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value ?? '',
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== undefined && value !== null) {
      const currentHtml = editor.getHTML();
      if (currentHtml !== value) {
        editor.commands.setContent(value);
      }
    } else if (editor && (value === undefined || value === null)) {
      const currentHtml = editor.getHTML();
      if (currentHtml !== '' && currentHtml !== '<p></p>') {
        editor.commands.setContent('');
      }
    }
  }, [editor, value]);

  // Sync disabled/editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  // Force a comfortable minimum editor height. We do this on the actual
  // ProseMirror DOM node rather than via Tailwind's `[&_.tiptap]:min-h-[…]`
  // arbitrary-selector + arbitrary-value combo, which doesn't compile
  // reliably in this Tailwind setup.
  useEffect(() => {
    if (editor) {
      editor.view.dom.style.minHeight = '200px';
    }
  }, [editor]);

  if (mode === 'view') {
    if (!value || value === '<p></p>') {
      return <span className="text-sm text-muted-foreground">{'\u2014'}</span>;
    }
    return (
      <div
        className="prose prose-sm max-w-none text-sm"
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  return (
    <div>
      <div className={`rounded-md border ${error ? 'border-red-500' : 'border-input'}`}>
        {editor && <Toolbar editor={editor} />}
        <EditorContent editor={editor} className="prose prose-sm max-w-none px-3 py-2 [&_.tiptap]:outline-none" />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
