import http from 'http';
import { AddressInfo } from 'net';

export interface IFixtureServer {
	port: number;
	baseUrl: string;
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

	const server = http.createServer((req, res) => {
		if (req.url === '/health') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', service: 'fixture-server' }));
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
	const port = address.port;
	const baseUrl = `http://127.0.0.1:${port}`;

	return {
		port,
		baseUrl,
		stop: () =>
			new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			})
	};
};
