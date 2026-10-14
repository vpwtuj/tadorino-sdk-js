import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CreateNoteInput, SearchNotesResult, GetNoteResult } from '@bright203/tadorino-sdk-js';
import { notes, LocalApiError } from './api';
import './style.css';

function App() {
  const [title, setTitle] = useState('機械メモの確認');
  const [body, setBody] = useState('## 機械が残すメモ\n原文と出典を、次の処理へ引き継ぎます。');
  const [query, setQuery] = useState('機械');
  const [status, setStatus] = useState('ローカルのExpressを経由して、メモを保存できます。');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [results, setResults] = useState<SearchNotesResult>({ items: [], has_more: false });
  const [note, setNote] = useState<GetNoteResult | null>(null);
  const pending = useRef<CreateNoteInput | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const perform = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setStatus('処理しています…');
    try { await action(current.signal); }
    catch (error) {
      if (current.signal.aborted) setStatus('操作を中止しました。保存の結果が不明なら、同じ内容を再送してください。');
      else setStatus(`処理を完了できませんでした${error instanceof LocalApiError ? `（HTTP ${error.status}）` : ''}。接続を確認してください。保存の結果が不明なら、同じ内容を再送してください。`);
    } finally { controller.current = null; setBusy(false); }
  };
  const save = () => void perform(async signal => {
    if (!pending.current) { pending.current = { title, body, idempotency_key: crypto.randomUUID() }; setLocked(true); }
    const result = await notes.createNote(pending.current, signal);
    setStatus(result.created ? '機械のメモを保存しました。' : '同じメモの保存を確認しました。重複は作成していません。');
  });
  const search = () => void perform(async signal => { const found = await notes.searchNotes({ query, limit: 10 }, signal); setResults(found); setStatus(`${found.items.length}件のメモが見つかりました。`); });
  const get = (id: string) => void perform(async signal => { setNote(await notes.getNote(id, signal)); setStatus('メモの全文を取り出しました。'); });
  return <main className="shell"><header><div className="brand"><span className="brand-icon">t</span><span>タドリノ <small>MACHINE EXAMPLE</small></span></div><span className="connection"><i/>localhost</span></header>
    <section className="intro"><span className="eyebrow">REACT → EXPRESS → SDK</span><h1>処理の知識を、<br/><em>次の処理へ。</em></h1><p>機械が所有するメモを、ローカルのアプリから操作します。</p></section>
    <aside className="demo-banner">localhost専用の開発例です。Client Secretと機械のAccess TokenはExpress内に保持します。利用者ごとの権限管理は利用アプリのバックエンドが担当します。</aside>
    <div className="workspace"><section className="card"><div className="section-title"><span className="step">01</span><h2>メモを残す</h2></div>
      <label htmlFor="title">タイトル</label><input id="title" value={title} disabled={busy || locked} onChange={event => setTitle(event.target.value)}/>
      <label htmlFor="body">本文 · Markdown</label><textarea id="body" rows={8} value={body} disabled={busy || locked} onChange={event => setBody(event.target.value)}/>
      <p className="hint">結果不明の再送でも、最初の内容と保存キーをそのまま使います。</p><div className="button-row"><button disabled={busy || !title || !body} onClick={save}>{locked ? '同じ内容を再送' : 'メモを保存'}</button>{locked && <button className="secondary" disabled={busy} onClick={() => { pending.current = null; setLocked(false); setStatus('新しい保存を開始できます。'); }}>新しい保存を開始</button>}</div></section>
    <section className="card"><div className="section-title"><span className="step">02</span><h2>メモを見つける</h2></div><label htmlFor="query">検索キーワード</label><form className="search-form" onSubmit={event => { event.preventDefault(); search(); }}><input id="query" value={query} disabled={busy} onChange={event => setQuery(event.target.value)}/><button disabled={busy || !query}>検索</button></form><div className="results">{results.items.length ? results.items.map(item => <button key={item.note_id} className="result" disabled={busy} onClick={() => get(item.note_id)}><strong>{item.title}</strong><span>{item.snippet}</span><small>全文を開く →</small></button>) : <p className="empty">保存したメモをキーワードで探せます。</p>}</div>{results.has_more && <p className="hint">検索語を追加して絞り込んでください。</p>}</section></div>
    <section className="card read"><div className="section-title"><span className="step">03</span><h2>全文を取り出す</h2></div>{note ? <article><h3>{note.title}</h3><pre>{note.body}</pre></article> : <p className="empty">検索結果を選ぶと、原文がここに表示されます。</p>}</section>
    <footer><p role="status" aria-live="polite">{status}</p>{busy && <button className="text-button" onClick={() => controller.current?.abort()}>操作を中止</button>}<span className="footer-label">SERVER CREDENTIALS · LOCAL ONLY</span></footer></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
