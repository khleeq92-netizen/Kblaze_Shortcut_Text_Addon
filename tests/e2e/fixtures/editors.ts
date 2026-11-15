// Real editor frameworks used by the E2E fixture page.
import Quill from 'quill';
import { createEditor, $getRoot } from 'lexical';
import { registerRichText, HeadingNode, QuoteNode } from '@lexical/rich-text';

const q = new Quill('#quill', { theme: undefined as any });
(window as any).quillText = () => q.getText();

const lexEl = document.getElementById('lexical')!;
const editor = createEditor({ namespace: 'fixture', onError: (e) => { throw e; }, nodes: [HeadingNode, QuoteNode] });
editor.setRootElement(lexEl);
registerRichText(editor);
(window as any).lexicalText = () => editor.getEditorState().read(() => $getRoot().getTextContent());
