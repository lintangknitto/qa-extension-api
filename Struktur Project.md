# Rest Boilerplate Backend Typescript Knitto

Repository ini digunakan untuk base dasar untuk pembuatan aplikasi backend, dan akan selalu di update sesuai kebutuhan yang ada di knitto.

**📚 Dokumentasi Lengkap:**  
Untuk detail lengkap layer responsibilities, templates, decision guide, dan best practices, lihat [Cursor Rules - Boilerplate](./.cursor/rules/boilerplate.mdc)

---

## 📋 Daftar Isi

- [Struktur Project](#struktur-project)
- [Konvensi Penamaan](#konvensi-penamaan)
- [Penjelasan Detail Struktur](#penjelasan-detail-struktur)
- [Contoh Implementasi](#contoh-implementasi)
- [Core Knitto Package](#core-knitto-package)

---

## 📁 Struktur Project

```
/ root directory
├─ database/                          # migration dan seeding database
│  └─ migrations/                     # file-file migration database
│
├─ src/                               # source code aplikasi
│  ├─ index.ts                        # entry point aplikasi
│  │
│  ├─ app/                            # folder jenis aplikasi yang dibuat
│  │  ├─ background/                  # aplikasi background (timer, scheduler, emitter)
│  │  │  ├─ [nama-background]/
│  │  │  │  ├─ [nama].handler.ts
│  │  │  │  └─ [nama].config.ts
│  │  │  └─ index.ts                  # konfigurasi background service
│  │  │
│  │  ├─ http/                        # aplikasi REST API
│  │  │  ├─ index.ts                  # konfigurasi server http & routing
│  │  │  │
│  │  │  ├─ [nama-domain]/            # domain atau modul fitur
│  │  │  │  ├─ [nama-fitur]/          # fitur spesifik dalam domain
│  │  │  │  │  ├─ [nama-fitur].controller.ts    # handler request/response
│  │  │  │  │  ├─ [nama-fitur].request.ts       # validasi input request
│  │  │  │  │  ├─ [nama-fitur].routes.ts        # definisi route endpoints
│  │  │  │  │  ├─ domain/                       # aturan bisnis (unit test wajib)
│  │  │  │  │  │  └─ *.domain.ts
│  │  │  │  │  ├─ queries/                      # SELECT queries
│  │  │  │  │  │  └─ *.queries.ts
│  │  │  │  │  ├─ repo/                         # INSERT/UPDATE/DELETE (optional)
│  │  │  │  │  │  └─ *.repo.ts
│  │  │  │  │  ├─ use-case/                     # flow orchestration (optional)
│  │  │  │  │  │  └─ *.use-case.ts
│  │  │  │  │  ├─ service/                      # external service calls (optional)
│  │  │  │  │  │  └─ *.service.ts
│  │  │  │  │  ├─ helper/                       # utility functions (unit test wajib)
│  │  │  │  │  │  └─ *.helper.ts
│  │  │  │  │  └─ __tests__/                    # unit tests
│  │  │  │  │     ├─ domain/
│  │  │  │  │     │  └─ *.domain.spec.ts
│  │  │  │  │     └─ helper/
│  │  │  │  │        └─ *.helper.spec.ts
│  │  │  │  │
│  │  │  │  └─ [sub-fitur]/           # nested fitur dalam domain
│  │  │  │     ├─ [sub-fitur].controller.ts
│  │  │  │     ├─ [sub-fitur].request.ts
│  │  │  │     └─ [sub-fitur].routes.ts
│  │  │  │
│  │  │  └─ middlewares/              # middleware khusus http
│  │  │     ├─ authorization.middleware.ts
│  │  │     └─ [nama-middleware].ts
│  │  │
│  │  ├─ messageBroker/               # aplikasi message broker
│  │  │  ├─ index.ts                  # konfigurasi message broker
│  │  │  ├─ publishers/               # publisher messages
│  │  │  │  └─ [nama].publisher.ts
│  │  │  └─ subscribers/              # subscriber/consumer messages
│  │  │     └─ [nama].subscriber.ts
│  │  │
│  │  └─ ws/                          # aplikasi websocket
│  │     ├─ index.ts                  # konfigurasi websocket server
│  │     └─ handlers/                 # event handlers
│  │        └─ [nama].handler.ts
│  │
│  ├─ libs/                           # library & utilities pendukung
│  │  ├─ config/                      # konfigurasi aplikasi
│  │  │  ├─ index.ts                  # export semua config
│  │  │  ├─ mysqlConnection.ts        # koneksi database
│  │  │  ├─ errorMessage.ts           # custom error messages
│  │  │  ├─ guestPathHttp.ts          # path yang tidak perlu auth
│  │  │  └─ gracefulShutdown.ts       # handler graceful shutdown
│  │  │
│  │  ├─ helpers/                     # helper functions general
│  │  │  ├─ formatDate.ts             # format tanggal
│  │  │  ├─ randomString.ts           # generate random string
│  │  │  ├─ delay.ts                  # delay/sleep function
│  │  │  └─ [nama-helper].ts
│  │  │
│  │  ├─ middlewares/                 # middleware global
│  │  │  ├─ basicPaginate.request.ts  # validasi pagination
│  │  │  ├─ idempotency-request.ts    # idempotency handling
│  │  │  └─ [nama-middleware].ts
│  │  │
│  │  └─ types/                       # type definitions global
│  │     ├─ Entities.d.ts             # entity types
│  │     ├─ express.d.ts              # express type extensions
│  │     └─ [nama-types].d.ts         # format: .d.ts
│  │
│  └─ shared/                         # shared business logic
│     └─ [nama-modul]/                # modul logic reusable
│        ├─ [nama-modul].service.ts   # business logic
│        ├─ [nama-modul].repo.ts      # data access
│        └─ [nama-modul].request.ts   # validasi
│
├─ storage/                           # penyimpanan file aplikasi
│  ├─ logs/                           # log files
│  │  ├─ http-logs-[date].log
│  │  └─ incoming-request-[date].log
│  └─ static/                         # file static
│     ├─ private/                     # hanya diakses oleh aplikasi
│     │  └─ images/
│     └─ public/                      # dapat diakses publik
│        └─ assets/
│
├─ tests/                             # test files terintegrasi
│  └─ integration/
│     └─ [nama-test].spec.ts
│
├─ .env                               # environment variables
├─ .env.example                       # template environment
├─ package.json                       # dependencies & scripts
├─ tsconfig.json                      # typescript configuration
├─ eslint.config.js                   # linting rules
├─ jest.config.js                     # testing configuration
└─ README.md                          # dokumentasi project
```

---

## 🔤 Konvensi Penamaan

### File & Folder

- **Folder & File**: Gunakan `kebab-case` untuk nama folder dan file
    ```
    ✅ cari-permintaan-chemical/
    ✅ pallet-mover.controller.ts
    ❌ CariPermintaanChemical/
    ❌ palletMover.controller.ts
    ```

### Struktur Penamaan File

Setiap fitur mengikuti pola penamaan konsisten:

```
[nama-fitur].controller.ts    # Handler HTTP request/response
[nama-fitur].request.ts       # Request validation schema
[nama-fitur].routes.ts        # Route definitions
domain/*.domain.ts            # Business rules (unit test wajib)
queries/*.queries.ts          # SELECT queries
repo/*.repo.ts                # INSERT/UPDATE/DELETE (optional)
use-case/*.use-case.ts        # Flow orchestration (optional)
service/*.service.ts          # External service calls (optional)
helper/*.helper.ts            # Utility functions (unit test wajib)
__tests__/domain/*.domain.spec.ts  # Unit tests domain
__tests__/helper/*.helper.spec.ts  # Unit tests helper
```

**📚 Detail Lengkap Penamaan dan Template:**  
Lihat [Cursor Rules - Boilerplate](./.cursor/rules/boilerplate.mdc) untuk template lengkap setiap file.

### Contoh Penamaan

```
✅ pemartaian-chemical.controller.ts
✅ user-state.service.ts
✅ stok-chemical.repo.ts
✅ validasi-scan.request.ts
```

---

## 📖 Penjelasan Detail Struktur

### 1. 📂 **database/**

Folder untuk database migration dan seeding berisi file-file SQL.

**Konvensi Penamaan File:**

- **Dari Product Backlog**: `PB-x.x.x.sql`
    - Format: `PB-[nomor-product-backlog].sql`
    - Contoh: `PB-1.2.3.sql`, `PB-2.1.0.sql`
    - x.x.x mewakili nomor product backlog

- **Dari Production Issue**: `[timestamp].sql`
    - Format: timestamp saat issue terjadi
    - Contoh: `20231015143000.sql`, `20240121090000.sql`
    - Format timestamp: `YYYYMMDDHHmmss`

### 2. 📂 **src/app/http/**

Folder utama untuk REST API endpoints

#### Organisasi Domain

Struktur HTTP menggunakan **domain-driven design**:

```
http/
├─ auth/                    # Domain authentication
├─ user-state/              # Domain user state
├─ pemartaian-chemical/     # Domain pemartaian chemical
│  ├─ pemartaian-pallet-kosong/
│  ├─ penyimpanan-kontainer/
│  └─ penyimpanan-pallet-ke-area-mesin/
└─ pindah-lokasi/           # Domain pindah lokasi
   ├─ kemasan/
   └─ pallet/
```

#### Layer Overview

Setiap fitur dapat memiliki layer berikut (semua optional kecuali controller, request, routes):

- **Controller** - HTTP request/response handler
- **Domain** - Business rules (unit test wajib)
- **Queries** - SELECT queries dari database
- **Repo** - INSERT/UPDATE/DELETE operations
- **Use-Case** - Flow orchestration untuk logic kompleks
- **Service** - External service calls
- **Helper** - Utility functions tanpa business logic (unit test wajib)
- ****tests**** - Unit tests untuk domain dan helper

**📚 Detail Lengkap Layer Responsibilities, Templates, dan Decision Guide:**  
Lihat [Cursor Rules - Boilerplate](./.cursor/rules/boilerplate.mdc) untuk:

- Penjelasan detail setiap layer
- Template kode lengkap
- Decision guide (kapan menggunakan layer apa)
- Best practices dan contoh implementasi

### 3. 📂 **src/shared/**

**Shared business logic yang reusable**

**Kriteria file di shared:**

- ✅ Logic yang digunakan di multiple domains
- ✅ Business logic yang tidak terikat pada endpoint tertentu
- ✅ Proses bisnis yang bersifat umum
- ❌ BUKAN untuk helpers/utilities umum (taruh di `libs/helpers`)

**Contoh yang tepat:**

```
shared/
├─ validasi-scan/               # Validasi scan dipakai di banyak fitur
│  ├─ validasi-scan.service.ts
│  └─ validasi-scan.request.ts
├─ user-state/                  # User state management global
│  ├─ user-state.service.ts
│  └─ user-state.repo.ts
└─ stok-chemical/               # Stok management dipakai di mana-mana
   └─ stok-chemical.repo.ts
```

### 4. 📂 **src/libs/**

**Library dan utilities pendukung aplikasi**

#### libs/config/

Konfigurasi aplikasi dan koneksi:

- `mysqlConnection.ts` - Koneksi database
- `errorMessage.ts` - Custom error messages
- `guestPathHttp.ts` - Path yang tidak perlu authentication
- `gracefulShutdown.ts` - Handler untuk shutdown aplikasi

#### libs/helpers/

Function-function utility yang bersifat general:

- `formatDate.ts` - Format tanggal
- `randomString.ts` - Generate random string
- `delay.ts` - Sleep/delay function
- Tidak boleh berisi business logic

#### libs/middlewares/

Middleware yang bersifat global:

- `authorization.middleware.ts` - Authentication & authorization
- `basicPaginate.request.ts` - Validasi pagination
- `idempotency-request.ts` - Idempotency handling

#### libs/types/

Type definitions global (format: `.d.ts`):

- `Entities.d.ts` - Database entity types
- `express.d.ts` - Express type extensions
- `listenerQueue.d.ts` - Message queue types

### 5. 📂 **src/app/background/**

Aplikasi yang berjalan di background:

- Timer/Scheduler (cron jobs)
- Event emitter
- Background workers
- Long-running processes

### 6. 📂 **src/app/messageBroker/**

Integrasi dengan message broker (RabbitMQ, Kafka, dll):

- **publishers/**: Publish messages ke queue
- **subscribers/**: Consume messages dari queue

### 7. 📂 **src/app/ws/**

Aplikasi WebSocket untuk real-time communication

### 8. 📂 **storage/**

Penyimpanan file aplikasi:

- **logs/**: Log files aplikasi
- **static/private/**: File yang hanya diakses aplikasi
- **static/public/**: File yang bisa diakses publik

### 9. 📂 **tests/**

Test files yang terintegrasi atau end-to-end testing

---

## 💡 Contoh Implementasi

### Contoh 1: Fitur Sederhana

Untuk fitur yang sederhana, cukup gunakan controller langsung:

```
home/
├─ home.controller.ts
├─ home.request.ts
└─ home.routes.ts
```

### Contoh 2: Fitur dengan Business Rules

Untuk fitur dengan business rules, tambahkan domain layer:

```
auth/
├─ auth.controller.ts
├─ auth.request.ts
├─ auth.routes.ts
├─ domain/
│  └─ auth.domain.ts          # Business rules (unit test wajib)
└─ __tests__/
   └─ domain/
      └─ auth.domain.spec.ts
```

### Contoh 3: Fitur dengan Database Operations

Untuk fitur yang butuh database operations:

```
cari-permintaan-chemical/
├─ cari-permintaan-chemical.controller.ts
├─ cari-permintaan-chemical.request.ts
├─ cari-permintaan-chemical.routes.ts
├─ queries/
│  └─ cari-permintaan-chemical.queries.ts  # SELECT queries
├─ repo/
│  └─ cari-permintaan-chemical.repo.ts     # INSERT/UPDATE/DELETE
└─ domain/
   └─ cari-permintaan-chemical.domain.ts   # Business rules
```

### Contoh 4: Fitur Kompleks (Full Layer)

Untuk fitur yang sangat kompleks dengan orchestration:

```
auth/
├─ auth.controller.ts
├─ auth.request.ts
├─ auth.routes.ts
├─ domain/
│  └─ auth.domain.ts
├─ queries/
│  └─ auth.queries.ts
├─ repo/
│  └─ auth.repo.ts
├─ use-case/
│  ├─ login.use-case.ts       # Flow orchestration
│  └─ logout.use-case.ts
├─ service/
│  └─ auth.service.ts         # External service calls (optional)
├─ helper/
│  └─ auth.helper.ts          # Utility functions (optional)
└─ __tests__/
   └─ domain/
      └─ auth.domain.spec.ts
```

**📚 Template Lengkap dan Contoh Implementasi:**  
Lihat [Cursor Rules - Boilerplate](./.cursor/rules/boilerplate.mdc) untuk template kode lengkap setiap layer.

### Contoh 5: Domain dengan Multiple Fitur

Organisasi nested untuk fitur yang saling berhubungan:

```
pemartaian-chemical/                      # Domain
├─ pemartaian-pallet-kosong/              # Sub-fitur 1
│  ├─ pemartaian-pallet-kosong.controller.ts
│  ├─ pemartaian-pallet-kosong.request.ts
│  └─ pemartaian-pallet-kosong.routes.ts
├─ penyimpanan-kontainer/                 # Sub-fitur 2
│  ├─ penyimpanan-kontainer.controller.ts
│  ├─ penyimpanan-kontainer.request.ts
│  └─ penyimpanan-kontainer.routes.ts
└─ penyimpanan-pallet-ke-area-mesin/      # Sub-fitur 3
   ├─ penyimpanan-pallet.controller.ts
   ├─ penyimpanan-pallet.request.ts
   └─ penyimpanan-pallet.routes.ts
```

### Contoh 6: Shared Logic Reusable

Logic yang digunakan di multiple domains:

```
shared/
└─ validasi-scan/
   ├─ validasi-scan.service.ts    # Logic validasi scan umum
   └─ validasi-scan.request.ts    # Schema validasi

# Digunakan di:
# - pemartaian-chemical/
# - pengosongan-mesin/
# - pindah-lokasi/
# - dll
```

### Contoh 7: Penggunaan Transaction dengan Multiple Repositories

Contoh real case dengan transaction:

```typescript
import CariPermintaanChemicalRepo from './cari-permintaan-chemical.repo';
import StokChemicalRepo from '@/shared/stok-chemical/stok-chemical.repo';
import mysqlConnection from '@/libs/config/mysqlConnection';

export const processScanPallet = async (data: any) => {
	const conn = mysqlConnection;

	try {
		// Start transaction
		await conn.raw('START TRANSACTION');

		// Instantiate repositories dengan connection yang sama
		const cariRepo = new CariPermintaanChemicalRepo(conn);
		const stokRepo = new StokChemicalRepo(conn);

		// Lock stok
		await stokRepo.lockStokChemical(data.id_stok_chemical);

		// Insert data cari permintaan
		await cariRepo.insertCariPermintaanChemical({
			no_permintaan: data.no_permintaan,
			id_detail_permintaan: data.id_detail_permintaan,
			no_lot: data.no_lot,
			no_kemasan: data.no_kemasan,
			id_pallet_permintaan: data.id_pallet_permintaan,
			user_scan: data.user_scan
		});

		// Update progres
		await cariRepo.updateProgresDetailPermintaan(data.no_permintaan);

		// Unlock stok
		await stokRepo.unlockStokChemical(data.id_stok_chemical, data.no_pallet_tujuan);

		// Commit transaction
		await conn.raw('COMMIT');

		return { success: true };
	} catch (error) {
		// Rollback jika ada error
		await conn.raw('ROLLBACK');
		throw error;
	}
};
```

---

## 🎯 Best Practices

### Poin Utama

1. **Naming Conventions** - `kebab-case` untuk file/folder, `PascalCase` untuk class
2. **Database Migrations** - `PB-x.x.x.sql` untuk product backlog, `YYYYMMDDHHmmss.sql` untuk production issue
3. **Layer Responsibilities** - Domain untuk business rules, Queries untuk SELECT, Repo untuk write operations
4. **Testing** - Unit test wajib untuk domain dan helper layer
5. **Error Handling** - Tidak boleh try-catch di layer tertentu, error handling di requestHandler middleware
6. **Module Alias** - Gunakan `@/` untuk import yang lebih clean

**📚 Detail Lengkap Best Practices:**  
Lihat [Cursor Rules - Boilerplate](./.cursor/rules/boilerplate.mdc) untuk:

- Decision guide (kapan menggunakan layer apa)
- Template kode lengkap
- Best practices detail
- Contoh implementasi lengkap

---

## 📦 Core Knitto Package

Repository ini menggunakan library khusus [**Knitto Core Backend**](https://github.com/knittotextile/knitto-core-backend) secara private.

### Package Utama:

- `@knittotextile/knitto-core-backend` - Core framework
- `@knittotextile/knitto-http` - HTTP utilities
- `@knittotextile/knitto-mysql` - MySQL connection
- `@knittotextile/knitto-rabbitmq` - RabbitMQ integration

### Instalasi:

Gunakan panduan berikut untuk install library core: [**Working with the npm registry**](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)

---

## 🚀 Quick Start

1. **Clone repository**

    ```bash
    git clone <repository-url>
    cd rest-boilerplate-ts
    ```

2. **Install dependencies**

    ```bash
    pnpm install
    ```

3. **Setup environment**

    ```bash
    cp .env.example .env
    # Edit .env sesuai kebutuhan
    ```

4. **Run development**

    ```bash
    pnpm dev
    ```

5. **Build production**
    ```bash
    pnpm build
    ```

---

## 📚 Referensi

- [Contoh Implementasi Real Project](https://github.com/knittotextile/kat-rest-mobile-operations)
