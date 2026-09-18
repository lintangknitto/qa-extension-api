# SQL parameterized — queries & repo

**DILARANG** concat nilai user ke string SQL. Gunakan placeholder `?` dan array parameter.

## Anti-pattern (blocker review)

```typescript
// ❌ SQL injection risk
export const getUserByEmail = async (email: string) => {
	const query = `SELECT id FROM users WHERE email = '${email}' LIMIT 1`;
	return await mysqlConnection.raw(query, []);
};
```

```typescript
// ❌ Partial concat tetap berbahaya
export const searchByName = async (name: string) => {
	return await mysqlConnection.raw(
		'SELECT id FROM users WHERE name LIKE \'%' + name + '%\'',
		[]
	);
};
```

## Pola benar

```typescript
import mysqlConnection from '@/libs/config/mysqlConnection';

export const getUserByEmail = async (email: string) => {
	const [row] = await mysqlConnection.rawQuery<Array<{ id: number }>>(
		'SELECT id FROM users WHERE email = ? LIMIT 1',
		[email]
	);
	return row ?? null;
};

export const searchByName = async (name: string) => {
	return await mysqlConnection.raw<Array<{ id: number; name: string }>>(
		'SELECT id, name FROM users WHERE name LIKE ? LIMIT 100',
		[`%${name}%`]
	);
};
```

- Dynamic `WHERE`: bangun **fragment statis** + push nilai ke `params[]` (lihat [`feature-scaffold/examples/query.snippet.md`](../../feature-scaffold/examples/query.snippet.md))
- Mutasi di `repo/*.repo.ts` — pola parameter sama via `this.getConnection()`

Playbook: [`../SKILL.md`](../SKILL.md) · Rule: [`knitto-security.mdc`](../../../rules/knitto-security.mdc)
