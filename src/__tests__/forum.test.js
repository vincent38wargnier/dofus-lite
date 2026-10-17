import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DEFAULT_FORUM_FILTERS, FORUM_FILTER_KEY, forumQuery, mergePosts, readForumFilters, replyTree } from '../platform/forumModel';
import { ForumHome } from '../platform/ForumFeed';
import { ThreadPage } from '../platform/ForumThread';

const base = { id: 'thread', title: 'Comment protéger le soigneur ?', body: 'Le garde reste près du pilier.', author: 'AuteurTest', owner: 'author', category: 'strategy', created: '2026-10-12T12:00:00Z', updated: '2026-10-13T12:00:00Z', likes: 0, isDemo: 0, library_id: 'world' };
const first = { id: 'r1', author: 'LecteurTest', owner: 'reader', body: 'Je couvre le passage.', reply_to: null, created: base.created, likes: 0 };
const child = { ...first, id: 'r2', owner: 'other', author: 'AutreTest', body: 'Et je soigne derrière toi.', reply_to: 'r1' };
const session = { user: { id: 'reader', handle: 'LecteurTest' } };
const libraries = [{ id: 'world', name: 'Monde du test', coverUrl: '/test-cover.png', description: 'Un terrain de test.' }];
const go = jest.fn(), account = jest.fn(fn => fn()), run = async fn => fn();

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLElement.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => { sessionStorage.clear(); jest.clearAllMocks(); account.mockImplementation(fn => fn()); });

test('invalid saved filters fall back safely and search terms stay URL encoded', () => {
  sessionStorage.setItem(FORUM_FILTER_KEY, '{broken');
  expect(readForumFilters(sessionStorage)).toEqual(DEFAULT_FORUM_FILTERS);
  sessionStorage.setItem(FORUM_FILTER_KEY, JSON.stringify({ category: 'bad', sort: 'top', source: 'members' }));
  expect(readForumFilters(sessionStorage)).toMatchObject({ category: 'all', sort: 'top', source: 'members' });
  const url = forumQuery({ ...DEFAULT_FORUM_FILTERS, query: 'feu & glace', library: 'world', feed: 'following' });
  expect(new URLSearchParams(url.split('?')[1]).get('q')).toBe('feu & glace');
  expect(url).toContain('following=1');
});

test('nested replies retain their parent even if received out of order', () => {
  const tree = replyTree([child, first]);
  expect(tree).toHaveLength(1);
  expect(tree[0].id).toBe('r1');
  expect(tree[0].children[0].id).toBe('r2');
});

test('deleted parents and cyclic imported relationships never hide comments', () => {
  expect(replyTree([child])[0].id).toBe('r2');
  expect(replyTree([{ ...first, reply_to: 'r2' }, child])).toHaveLength(2);
  expect(replyTree([{ ...first, reply_to: 'r1' }])[0].children).toEqual([]);
});

test('loading more comments preserves a new local reply and removes duplicates', () => {
  expect(mergePosts([first, child], [{ ...first, likes: 2 }])).toEqual([{ ...first, likes: 2 }, child]);
});

test('feed sort, followed topics and source filters are real API parameters', async () => {
  const api = jest.fn(async () => ({ topics: [{ ...base, replies: 1 }], total: 1 }));
  render(<ForumHome api={api} act={run} go={go} newTopic={jest.fn()} libraries={libraries} stats={{ demoMembers: 300 }} session={session} needAccount={account} />);
  await screen.findByRole('link', { name: base.title });
  fireEvent.click(screen.getByRole('button', { name: 'Les plus aimés' }));
  await waitFor(() => expect(api.mock.calls.at(-1)[0]).toContain('sort=top'));
  fireEvent.click(screen.getByLabelText('Masquer les exemples'));
  await waitFor(() => expect(api.mock.calls.at(-1)[0]).toContain('source=members'));
  fireEvent.click(screen.getByRole('button', { name: 'Mes discussions suivies' }));
  await waitFor(() => expect(api.mock.calls.at(-1)[0]).toContain('following=1'));
  expect(readForumFilters(sessionStorage)).toMatchObject({ sort: 'top', feed: 'following', source: 'members' });
});

test('topic composer receives the selected world and category', async () => {
  const create = jest.fn(), api = jest.fn(async () => ({ topics: [], total: 0 }));
  render(<ForumHome api={api} act={run} go={go} newTopic={create} libraries={libraries} stats={{}} session={session} needAccount={account} />);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Catégories' })).getByRole('button', { name: /Stratégies/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Monde du test' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nouvelle discussion' }));
  expect(create).toHaveBeenCalledWith({ category: 'strategy', libraryId: 'world' });
});

test('a stale search response cannot replace the current feed', async () => {
  let resolveFirst;
  const api = jest.fn(url => url.includes('q=nouveau') ? Promise.resolve({ topics: [{ ...base, id: 'new', title: 'Nouveau sujet' }], total: 1 }) : new Promise(resolve => { resolveFirst = resolve; }));
  render(<ForumHome api={api} act={run} go={go} newTopic={jest.fn()} libraries={[]} stats={{}} session={session} needAccount={account} />);
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nouveau' } });
  await screen.findByRole('link', { name: 'Nouveau sujet' });
  await act(async () => resolveFirst({ topics: [{ ...base, replies: 1 }], total: 1 }));
  expect(screen.queryByRole('link', { name: base.title })).not.toBeInTheDocument();
});

test('thread replies can be collapsed without losing their children', async () => {
  const api = jest.fn(async () => ({ ...base, replies: [first, child], replyCount: 2 }));
  render(<ThreadPage id="thread" {...{ api, session, go }} act={run} needAccount={account} report={jest.fn()} libraries={libraries} />);
  await screen.findByText(child.body);
  fireEvent.click(screen.getByRole('button', { name: 'Replier le message de LecteurTest' }));
  expect(screen.queryByText(child.body)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Déplier le message de LecteurTest' }));
  expect(screen.getByText(child.body)).toBeInTheDocument();
});

test('replying inline sends the real parent id and appends the acknowledged reply', async () => {
  const api = jest.fn(async (url, options) => options?.method === 'POST'
    ? { id: 'r3', reply: { ...first, id: 'r3', body: 'On essaie ce placement.', reply_to: 'r2' } }
    : { ...base, replies: [first, child], replyCount: 2 });
  render(<ThreadPage id="thread" {...{ api, session, go }} act={run} needAccount={account} report={jest.fn()} libraries={libraries} />);
  await screen.findByText(child.body);
  fireEvent.click(within(document.getElementById('reply-r2')).getByRole('button', { name: 'Répondre' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Votre réponse' }), { target: { value: 'On essaie ce placement.' } });
  fireEvent.submit(document.querySelector('.af-forum-composer'));
  await waitFor(() => expect(document.getElementById('reply-r3')).not.toBeNull());
  expect(JSON.parse(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)).toEqual({ body: 'On essaie ce placement.', replyTo: 'r2' });
  expect(document.getElementById('reply-r3').closest('.af-comment-child')).toBeInTheDocument();
});

test('locked discussions allow reading but offer no way to reply or quote', async () => {
  const api = jest.fn(async () => ({ ...base, locked: 1, replies: [first], replyCount: 1 }));
  render(<ThreadPage id="thread" {...{ api, session, go }} act={run} needAccount={account} report={jest.fn()} />);
  await screen.findByText(first.body);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Répondre' })).not.toBeInTheDocument();
  expect(screen.queryByText('Citer')).not.toBeInTheDocument();
});

test('user text is displayed as text, never executed as markup', async () => {
  const api = jest.fn(async () => ({ ...base, body: '<img src=x onerror=alert(1)>', replies: [], replyCount: 0 }));
  render(<ThreadPage id="thread" {...{ api, session, go }} act={run} needAccount={account} report={jest.fn()} />);
  await screen.findByText('<img src=x onerror=alert(1)>');
  expect(document.querySelector('.af-post-body img')).toBeNull();
});
