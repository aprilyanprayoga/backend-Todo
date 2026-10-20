const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const stamp = Date.now();
let failures = 0;

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${extra}`}`);
  if (!ok) failures++;
};

async function makeUser(tag) {
  const email = `e2e-${tag}-${stamp}@example.com`;
  const password = 'Password-e2e-123';
  const reg = await api('POST', '/auth/register', { body: { email, password } });
  if (!reg.json.data?.session) throw new Error(`Register ${tag} tidak mengembalikan session (Confirm email aktif?) ${JSON.stringify(reg.json)}`);
  const login = await api('POST', '/auth/login', { body: { email, password } });
  return { email, token: login.json.data.session.access_token, id: login.json.data.user.id };
}

const A = await makeUser('a');
const B = await makeUser('b');

const me = await api('GET', '/auth/me', { token: A.token });
check('GET /auth/me sebagai A', me.status === 200 && me.json.data.user.id === A.id);

const created = await api('POST', '/todos', { token: A.token, body: { title: 'Rahasia A', user_id: B.id } });
check('A membuat todo (user_id dari body diabaikan)', created.status === 201 && created.json.data.user_id === A.id, JSON.stringify(created.json));
const todoId = created.json.data?.id;

check('A bisa membaca todonya', (await api('GET', `/todos/${todoId}`, { token: A.token })).status === 200);
check('B GET todo A -> 404', (await api('GET', `/todos/${todoId}`, { token: B.token })).status === 404);
check('B PATCH todo A -> 404', (await api('PATCH', `/todos/${todoId}`, { token: B.token, body: { title: 'diretas' } })).status === 404);
check('B DELETE todo A -> 404', (await api('DELETE', `/todos/${todoId}`, { token: B.token })).status === 404);
const listB = await api('GET', '/todos', { token: B.token });
check('B list todo kosong', listB.status === 200 && listB.json.data.length === 0 && listB.json.meta.total === 0);
check('Tanpa token -> 401', (await api('GET', '/todos')).status === 401);
check('Token palsu -> 401', (await api('GET', '/todos', { token: 'palsu' })).status === 401);

const stillThere = await api('GET', `/todos/${todoId}`, { token: A.token });
check('Todo A tetap utuh', stillThere.status === 200 && stillThere.json.data.title === 'Rahasia A');

check('A DELETE todonya -> 200', (await api('DELETE', `/todos/${todoId}`, { token: A.token })).status === 200);
check('Logout A -> 200', (await api('POST', '/auth/logout', { token: A.token })).status === 200);

console.log(failures === 0 ? '\nSEMUA TES E2E LULUS' : `\n${failures} TES GAGAL`);
process.exit(failures === 0 ? 0 : 1);
