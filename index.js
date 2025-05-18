import axios from "axios";
import { readFileSync, existsSync } from "fs";
import { ethers } from "ethers";
import { HttpsProxyAgent } from "https-proxy-agent";

// --- Konfigurasi
const referralCode = "xxxxxx"; // Ganti referral sesuai kebutuhan
const proxyFile = "proxy.txt";
const akunFile = "akun.json";

// --- Fungsi bantu
function loadProxies() {
  if (!existsSync(proxyFile)) {
    console.log("proxy.txt tidak ditemukan, tidak akan gunakan proxy.");
    return [];
  }

  return readFileSync(proxyFile, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function getRandomProxyAgent(proxies) {
  if (!proxies.length) return null;
  const proxyUrl = proxies[Math.floor(Math.random() * proxies.length)];
  return new HttpsProxyAgent(proxyUrl);
}

// --- Proses utama untuk tiap akun
async function runForAccount(account, proxyAgent) {
  const wallet = new ethers.Wallet(account.privateKey);
  const axiosConfig = proxyAgent ? { httpsAgent: proxyAgent } : {};

  try {
    console.log(`Mulai mining dan check-in untuk ${wallet.address}`);

    // 0. Tracking
    const trackingPayload = {
      uid: Math.random().toString(36).slice(2, 10),
      ipAddress: "114.10.102.71",
      queryString: [{ key: "referralCode", value: referralCode }],
      referrer: null,
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      updatedAt: Date.now().toString(),
      address: wallet.address,
    };

    const trackingRes = await axios.post(
      "https://api-desk.metacrm.inc/api/tracking",
      trackingPayload,
      axiosConfig
    );
    console.log(`[tracking] ${wallet.address} => ${trackingRes.data.message || "OK"}`);

    // 1. Request message
    const msgRes = await axios.post(
      "https://api.prdt.finance/auth/request-message",
      {
        address: wallet.address,
        chain: 1,
        network: "evm",
      },
      axiosConfig
    );

    const message = msgRes.data.message;
    const nonce = msgRes.data.nonce;

    // 2. Sign
    const signature = await wallet.signMessage(message);

    // 3. Verify
    const verifyRes = await axios.post(
      "https://api.prdt.finance/auth/verify",
      {
        message,
        nonce,
        signature,
        address: wallet.address,
      },
      {
        ...axiosConfig,
        validateStatus: null,
      }
    );

    const cookies = verifyRes.headers["set-cookie"];
    if (!cookies || cookies.length === 0) {
      console.log(`Gagal mendapatkan auth cookie untuk ${wallet.address}`);
      return;
    }

    const authCookie = cookies.join("; ");

    // 4. Start mining
    const mineRes = await axios.post(
      "https://tokenapi.prdt.finance/api/v1/mine/start",
      { referralCode },
      {
        ...axiosConfig,
        headers: { Cookie: authCookie },
      }
    );

    console.log(`Mining response ${wallet.address}:`, mineRes.data);

    if (mineRes.data.success) {
      // 5. Check-in
      const checkInRes = await axios.post(
        "https://tokenapi.prdt.finance/api/v1/mine/checkin",
        {},
        {
          ...axiosConfig,
          headers: { Cookie: authCookie },
        }
      );

      console.log(`Check-in berhasil untuk ${wallet.address}:`, checkInRes.data);
    } else {
      console.log(`Mining gagal untuk ${wallet.address}`);
    }
  } catch (err) {
    console.log(`Error akun ${wallet.address}:`, err.response?.data || err.message);
  }
}

// --- Menjalankan semua akun
async function main() {
  if (!existsSync(akunFile)) {
    console.log("akun.json tidak ditemukan.");
    return;
  }

  const accounts = JSON.parse(readFileSync(akunFile, "utf-8"));
  const proxies = loadProxies();

  for (const acc of accounts) {
    const proxyAgent = getRandomProxyAgent(proxies);
    await runForAccount(acc, proxyAgent);
  }

  console.log("--- Selesai mining dan check-in semua akun ---");
}

// --- Loop otomatis 24 jam
async function loopForever() {
  while (true) {
    console.log(`\n== Mulai proses pada ${new Date().toLocaleString()} ==\n`);
    await main();
    console.log(`\n== Menunggu 24 jam sebelum run ulang ==\n`);
    await new Promise((resolve) => setTimeout(resolve, 24 * 60 * 60 * 1000)); // 24 jam
  }
}

loopForever();
