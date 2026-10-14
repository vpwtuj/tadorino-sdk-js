import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { TadorinoClient, TadorinoError } from '@bright203/tadorino-sdk-js';

type ClientOptions = ConstructorParameters<typeof TadorinoClient>[0];
type CreateInput = Parameters<TadorinoClient['createNote']>[0];
type SearchResult = Awaited<ReturnType<TadorinoClient['searchNotes']>>;
type Note = Awaited<ReturnType<TadorinoClient['getNote']>>;

export function AuthenticatedApp({ baseUrl, audience }: { baseUrl: string; audience: string }) {
  const auth = useAuth0();
  const getAccessToken = useCallback<ClientOptions['getAccessToken']>(async () => { const token = await auth.getAccessTokenSilently({ authorizationParams: { audience, scope: 'notes:read notes:write' } }); if (!token) throw new Error('Access token unavailable.'); return token; }, [auth.getAccessTokenSilently, audience]);
  if (auth.isLoading) return <main className="configuration"><h1>タドリノ SDK</h1><p>ログイン状態を確認しています。</p></main>;
  if (auth.error) return <main className="configuration"><h1>ログインを完了できませんでした</h1><p>Auth0のSPA設定・利用許可を確認して、もう一度ログインしてください。</p><button onClick={() => void auth.loginWithRedirect()}>ログイン</button></main>;
  if (!auth.isAuthenticated) return <main className="configuration"><span className="eyebrow">TADORINO · JAVASCRIPT SDK</span><h1>会話の知識を、<br/>次のアイデアへ。</h1><p>メールのワンタイムコードでログインし、メモの保存・検索・全文取得を試せます。</p><button onClick={() => void auth.loginWithRedirect()}>メールでログイン</button></main>;
  return <App key={auth.user?.sub} baseUrl={baseUrl} mode="auth0" getAccessToken={getAccessToken} onLogout={() => void auth.logout({ logoutParams: { returnTo: window.location.origin } })} />;
}

export function App({ baseUrl, mode, getAccessToken, onLogout }: { baseUrl: string; mode: 'synthetic' | 'fixture' | 'auth0'; getAccessToken: ClientOptions['getAccessToken']; onLogout?: () => void }) {
  const client = useMemo(() => new TadorinoClient({ baseUrl, getAccessToken }), [baseUrl, getAccessToken]);
  const [title, setTitle] = useState('SDKの確認');
  const [body, setBody] = useState('## 気づき\nReactから保存したメモを、検索して取り出します。');
  const [query, setQuery] = useState('SDK');
  const [status, setStatus] = useState('保存するメモを入力してください。');
  const [busy, setBusy] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [results, setResults] = useState<SearchResult>({ items: [], has_more: false });
  const [note, setNote] = useState<Note | null>(null);
  const pending = useRef<CreateInput | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const perform = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setStatus('処理しています…');
    try { await action(current.signal); }
    catch (error) {
      if (error instanceof TadorinoError) {
        const http = error.status === null ? '' : ` · HTTP ${error.status}`;
        setStatus(`処理を完了できませんでした（${error.kind}${http}）。保存の結果が不明なら、同じ内容を再送してください。`);
      } else { setStatus('処理を完了できませんでした。設定と接続を確認してください。'); }
    } finally { controller.current = null; setBusy(false); }
  };
  const save = () => void perform(async signal => {
    if (!pending.current) {
      pending.current = { title, body, idempotency_key: crypto.randomUUID() };
      setHasPending(true);
    }
    const saved = await client.createNote(pending.current, { signal });
    setStatus(saved.created ? 'メモを保存しました。検索して全文を取り出せます。' : '同じメモの保存を確認しました。重複は作成していません。');
  });
  const search = () => void perform(async signal => {
    const found = await client.searchNotes({ query, limit: 10 }, { signal });
    setResults(found);
    setStatus(`${found.items.length}件のメモが見つかりました。`);
  });
  const retrieve = (id: string) => void perform(async signal => {
    setNote(await client.getNote(id, { signal }));
    setStatus('メモの全文を取り出しました。');
  });

  return <main className="shell">
    <header><div className="brand"><span className="brand-icon">t</span><span>タドリノ <small>SDK EXAMPLE</small></span></div><div className="header-actions"><span className="connection"><i/>{mode === 'auth0' ? 'ログイン済み' : '合成データの検証'}</span>{onLogout && <button className="text-button" onClick={onLogout} disabled={busy}>ログアウト</button>}</div></header>
    <section className="intro"><span className="eyebrow">REACT + VITE + TYPESCRIPT</span><h1>残して、見つけて、<br/><em>また使う。</em></h1><p>ひとつのSDKで、メモの保存・検索・全文取得を体験できます。</p></section>
    {mode !== 'auth0' && <aside className="demo-banner">{mode === 'fixture' ? 'ローカルJWT・実REST・一時PostgreSQLでの合成データ検証です。OTP・実Auth0・公開サービスは検証しません。' : 'ローカルの合成データ専用モードです。OTP・Auth0・実サービスの接続検証は行いません。'}</aside>}
    <div className="workspace"><section className="card compose"><div className="section-title"><span className="step">01</span><h2>メモを残す</h2></div><label htmlFor="title">タイトル</label><input id="title" value={title} onChange={event => setTitle(event.target.value)} disabled={busy || hasPending}/><label htmlFor="body">本文 · Markdown</label><textarea id="body" rows={8} value={body} onChange={event => setBody(event.target.value)} disabled={busy || hasPending}/><p className="hint">再送時には、最初に決めた内容と保存キーをそのまま使います。</p><div className="button-row"><button onClick={save} disabled={busy || !title || !body}>{hasPending ? '同じ内容を再送' : 'メモを保存'}</button>{hasPending && <button className="secondary" disabled={busy} onClick={() => { pending.current = null; setHasPending(false); setStatus('新しいメモとして保存できます。'); }}>新しい保存を開始</button>}</div></section>
    <section className="card find"><div className="section-title"><span className="step">02</span><h2>メモを見つける</h2></div><label htmlFor="query">検索キーワード</label><form className="search-form" onSubmit={event => { event.preventDefault(); search(); }}><input id="query" value={query} onChange={event => setQuery(event.target.value)} disabled={busy}/><button type="submit" disabled={busy || !query}>検索</button></form><div className="results">{results.items.length === 0 ? <p className="empty">キーワードで、残したメモを探せます。</p> : results.items.map(item => <button key={item.note_id} className="result" disabled={busy} onClick={() => retrieve(item.note_id)}><strong>{item.title}</strong><span>{item.snippet}</span><small>{item.created_at} · 全文を開く →</small></button>)}</div>{results.has_more && <p className="hint">ほかにも結果があります。検索語を追加して絞り込んでください。</p>}</section></div>
    <section className="card read"><div className="section-title"><span className="step">03</span><h2>全文を取り出す</h2></div>{note ? <article><h3>{note.title}</h3><pre>{note.body}</pre>{note.sources.map((source, index) => <p className="source" key={index}>{source.title}{source.url && <span> · {source.url}</span>}{source.excerpt && <span> · {source.excerpt}</span>}</p>)}</article> : <p className="empty">検索結果を選ぶと、メモの原文がここに表示されます。</p>}</section>
    <footer><p role="status" aria-live="polite">{status}</p>{busy && <button className="text-button" onClick={() => controller.current?.abort()}>操作を中止</button>}<span className="footer-label">@bright203/tadorino-sdk-js · 0.1.0</span></footer>
  </main>;
}
