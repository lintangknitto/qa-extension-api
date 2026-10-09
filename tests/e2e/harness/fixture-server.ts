import http from 'http';
import { AddressInfo } from 'net';

export interface IFixtureServer {
	port: number;
	baseUrl: string;
	/** requestId respons 5xx terakhir dari `POST /api/order`. */
	lastOrderRequestId: () => string | null;
	/** Upload terakhir dari halaman `/upload` (nama file + isi base64). */
	lastUpload: () => { name: string; type: string; data: string } | null;
	stop: () => Promise<void>;
}

export const startFixtureServer = async (): Promise<IFixtureServer> => {
	const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Portal Knitto Fixture App</title>
  <style>
    body { font-family: sans-serif; padding: 24px; background: #f8fafc; }
    .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 500px; margin: auto; }
    input, button { display: block; width: 100%; margin: 10px 0; padding: 10px; box-sizing: border-box; }
    button { background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
    .message { margin-top: 15px; padding: 10px; background: #dcfce7; color: #166534; border-radius: 4px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Knitto QA Test Target</h2>
    <p>Halaman fixture lokal untuk pengujian recorder E2E.</p>
    <label for="product-name">Nama Produk:</label>
    <input type="text" id="product-name" data-testid="product-name" placeholder="Kain Cotton Combed 30s" />
    
    <label for="quantity">Jumlah Roll:</label>
    <input type="number" id="quantity" data-testid="quantity" placeholder="5" />
    
    <button type="button" id="submit-btn" data-testid="submit-btn">Tambah ke Keranjang</button>
    <div id="status-message" data-testid="status-message" class="message">Produk berhasil ditambahkan ke keranjang!</div>
  </div>

  <script>
    // Inisialisasi fake credential fixtures pada storage & cookie browser
    document.cookie = "fake_auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e2e-fake-token-do-not-use-in-prod; path=/";
    localStorage.setItem("fake_user_id", "user_e2e_fixture_999");
    localStorage.setItem("fake_session_key", "sec_e2e_fake_random_8471928");
    sessionStorage.setItem("fake_cart_token", "cart_e2e_abcdef_test");

    const btn = document.getElementById('submit-btn');
    const msg = document.getElementById('status-message');
    btn.addEventListener('click', () => {
      msg.style.display = 'block';
      msg.innerText = 'Produk ' + (document.getElementById('product-name').value || 'Default') + ' berhasil ditambahkan!';
    });
  </script>
</body>
</html>`;

	// Halaman dengan ragam aksi (fill, select, checkbox, klik) + tombol yang memicu request 5xx.
	const checkoutHtml = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><title>Checkout Fixture</title></head>
<body>
  <main style="max-width:480px;margin:24px auto;font-family:sans-serif">
    <h2>Checkout Kain</h2>
    <label for="customer">Nama Pelanggan</label>
    <input id="customer" type="text" />
    <label for="fabric">Jenis Kain</label>
    <select id="fabric">
      <option value="">Pilih kain</option>
      <option value="cc30">Cotton Combed 30s</option>
      <option value="rayon">Rayon Viscose</option>
    </select>
    <label><input id="express" type="checkbox" /> Kirim Ekspres</label>
    <button type="button" id="quote">Hitung Ongkir</button>
    <button type="button" id="order">Buat Pesanan</button>
    <p id="result" role="status"></p>
  </main>
  <script>
    const result = document.getElementById('result');
    document.getElementById('quote').addEventListener('click', () => {
      const fabric = document.getElementById('fabric');
      const express = document.getElementById('express').checked ? 'ekspres' : 'reguler';
      result.textContent = 'Ongkir ' + fabric.options[fabric.selectedIndex].text + ' untuk ' + document.getElementById('customer').value + ' (' + express + ')';
    });
    document.getElementById('order').addEventListener('click', async () => {
      const res = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      result.textContent = res.ok ? 'Pesanan dibuat' : 'Gagal membuat pesanan (' + res.status + ')';
    });
  </script>
</body>
</html>`;

	// Halaman satu warna penuh: video multi-tab diverifikasi dengan sampling warna frame (merah = tab A, biru = tab B).
	const colorHtml = (color: string) => `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>Tab ${color}</title>
<style>html,body{margin:0;height:100%;background:${color}}a{display:block;padding:24px;color:#fff;font:600 20px sans-serif}</style></head>
<body><a id="open-blue" href="/color/blue" target="_blank">Buka tab biru</a></body></html>`;

	// Upload file: isi file dikirim ke server agar E2E bisa memverifikasi nama + isi yang dipasang re-run.
	const uploadHtml = `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>Upload Fixture</title></head>
<body>
  <label for="lampiran">Lampiran</label>
  <input id="lampiran" type="file" />
  <p id="upload-status" role="status"></p>
  <script>
    document.getElementById('lampiran').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const data = String(reader.result).split(',')[1] || '';
        await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, data }) });
        document.getElementById('upload-status').textContent = 'Terunggah: ' + file.name;
      };
      reader.readAsDataURL(file);
    });
  </script>
</body></html>`;

	let lastUpload: { name: string; type: string; data: string } | null = null;
	let orderRequestCount = 0;
	let lastOrderRequestId: string | null = null;
	let port = 0;

	const server = http.createServer((req, res) => {
		if (req.url === '/health') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', service: 'fixture-server' }));
			return;
		}

		const colorMatch = req.url?.match(/^\/color\/(red|blue)$/);
		if (colorMatch) {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(colorHtml(colorMatch[1] === 'red' ? '#ff0000' : '#0000ff'));
			return;
		}

		if (req.url === '/upload') {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(uploadHtml);
			return;
		}

		if (req.url === '/api/upload' && req.method === 'POST') {
			let body = '';
			req.on('data', (chunk) => (body += chunk));
			req.on('end', () => {
				lastUpload = JSON.parse(body);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end('{"ok":true}');
			});
			return;
		}

		if (req.url === '/checkout') {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(checkoutHtml);
			return;
		}

		// Endpoint yang selalu gagal 5xx dengan request-id, untuk menguji investigasi (ISSUES 8.3).
		if (req.url === '/api/order' && req.method === 'POST') {
			orderRequestCount += 1;
			const requestId = `req-e2e-5xx-${orderRequestCount}-${port}`;
			lastOrderRequestId = requestId;
			res.writeHead(500, { 'Content-Type': 'application/json', 'X-Request-Id': requestId });
			res.end(JSON.stringify({ message: 'Internal Server Error', requestId }));
			return;
		}

		res.writeHead(200, {
			'Content-Type': 'text/html; charset=utf-8',
			'Set-Cookie': 'fake_auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e2e-fake-token-do-not-use-in-prod; Path=/'
		});
		res.end(html);
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve());
	});

	const address = server.address() as AddressInfo;
	port = address.port;
	const baseUrl = `http://127.0.0.1:${port}`;

	return {
		port,
		baseUrl,
		lastOrderRequestId: () => lastOrderRequestId,
		lastUpload: () => lastUpload,
		stop: () =>
			new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			})
	};
};
