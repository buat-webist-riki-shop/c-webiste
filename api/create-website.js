import { Octokit } from "@octokit/rest";
import fetch from "node-fetch";
import formidable from "formidable";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

// --- Konfigurasi (Pastikan sudah diatur di Environment Variables Vercel) ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const REPO_NAME_FOR_JSON = "c-webiste"; // Ganti dengan nama repo tempat file .json Anda disimpan

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// --- Helper GitHub ---
async function readJsonFromGithub(filePath) {
    try {
        const { data } = await octokit.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME_FOR_JSON, path: filePath });
        const content = Buffer.from(data.content, "base64").toString();
        return JSON.parse(content);
    } catch (err) {
        if (err.status === 404) return {};
        throw err;
    }
}
async function writeJsonToGithub(filePath, json, message) {
    let sha;
    try {
        const { data } = await octokit.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME_FOR_JSON, path: filePath });
        sha = data.sha;
    } catch (err) {
        if (err.status !== 404) throw err;
    }
    const content = Buffer.from(JSON.stringify(json, null, 2)).toString("base64");
    await octokit.repos.createOrUpdateFileContents({ owner: REPO_OWNER, repo: REPO_NAME_FOR_JSON, path: filePath, message, content, sha });
}

// --- Handler Utama ---
export default async function handler(request, response) {
    if (request.method === 'GET') {
        return handleGetDomains(request, response);
    }
    if (request.method === 'POST') {
        const contentType = request.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data')) {
            return handleCreateWebsite(request, response);
        } else {
            return handleAdminActions(request, response);
        }
    }
    return response.status(405).json({ message: 'Metode tidak diizinkan.' });
}

// --- Logika GET untuk daftar domain ---
async function handleGetDomains(request, response) {
    try {
        const domainsData = JSON.parse(fs.readFileSync(path.resolve('./data/domains.json'), 'utf-8'));
        return response.status(200).json(Object.keys(domainsData));
    } catch (error) {
        console.error("Gagal membaca domains.json:", error);
        return response.status(500).json({ message: "Gagal memuat daftar domain." });
    }
}

// --- Logika POST untuk Admin ---
async function handleAdminActions(request, response) {
    try {
        const { action, data, adminPassword } = request.body;
        if (adminPassword !== ADMIN_PASSWORD) throw new Error("Password admin salah.");

        const APIKEYS_PATH = "data/apikeys.json";
        let apiKeys = await readJsonFromGithub(APIKEYS_PATH);

        switch (action) {
            case "getApiKeys":
                return response.status(200).json(apiKeys);
            case "createApiKey": {
                const { key, duration, unit, isPermanent } = data;
                if (!key) throw new Error("Nama API Key tidak boleh kosong.");
                if (apiKeys[key]) throw new Error("API Key ini sudah ada.");

                let expires_at = "permanent";
                if (!isPermanent) {
                    const now = new Date();
                    const d = parseInt(duration, 10);
                    if (unit === "days") now.setDate(now.getDate() + d);
                    else if (unit === "weeks") now.setDate(now.getDate() + (d * 7));
                    else if (unit === "months") now.setMonth(now.getMonth() + d);
                    expires_at = now.toISOString();
                }
                apiKeys[key] = { created_at: new Date().toISOString(), expires_at };
                await writeJsonToGithub(APIKEYS_PATH, apiKeys, `Create API Key: ${key}`);
                return response.status(200).json({ message: `Kunci '${key}' berhasil dibuat.` });
            }
            case "deleteApiKey": {
                const { key } = data;
                if (!apiKeys[key]) throw new Error("API Key tidak ditemukan.");
                delete apiKeys[key];
                await writeJsonToGithub(APIKEYS_PATH, apiKeys, `Delete API Key: ${key}`);
                return response.status(200).json({ message: `Kunci '${key}' berhasil dihapus.` });
            }
            default:
                throw new Error("Aksi admin tidak dikenal.");
        }
    } catch (error) {
        return response.status(500).json({ message: error.message });
    }
}

// --- Logika POST untuk Create Website ---
async function handleCreateWebsite(request, response) {
    const tempDir = path.join("/tmp", `website-${Date.now()}`);
    try {
        const form = formidable({ maxFileSize: 10 * 1024 * 1024, uploadDir: "/tmp" });
        const [fields, files] = await form.parse(request);
        const { subdomain, rootDomain, apiKey } = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]]));
        const uploadedFile = files.websiteFile[0];
        if (!subdomain || !rootDomain || !apiKey || !uploadedFile) throw new Error("Semua kolom wajib diisi.");

        const validApiKeys = await readJsonFromGithub("data/apikeys.json");
        const keyData = validApiKeys[apiKey];
        if (!keyData || (keyData.expires_at !== "permanent" && new Date() > new Date(keyData.expires_at))) {
           throw new Error("API Key tidak valid atau sudah kadaluwarsa.");
        }

        fs.mkdirSync(tempDir);
        if (uploadedFile.mimetype === "application/zip") new AdmZip(uploadedFile.filepath).extractAllTo(tempDir, true);
        else if (uploadedFile.mimetype === "text/html") fs.renameSync(uploadedFile.filepath, path.join(tempDir, "index.html"));
        else throw new Error("Format file tidak didukung. Harap unggah .zip atau .html.");
        if (!fs.existsSync(path.join(tempDir, "index.html"))) throw new Error("File 'index.html' tidak ditemukan.");

        const repoName = `${subdomain.replace(/[^a-z0-9-]/gi, '')}-${Math.floor(100 + Math.random() * 900)}`;
        await octokit.repos.createForAuthenticatedUser({ name: repoName, private: true });
        
        const filesToUpload = fs.readdirSync(tempDir);
        for (const file of filesToUpload) {
            const content = fs.readFileSync(path.join(tempDir, file), "base64");
            await octokit.repos.createOrUpdateFileContents({ owner: REPO_OWNER, repo: repoName, path: file, message: `Initial commit`, content });
        }
        
        const vercelApiUrl = VERCEL_TEAM_ID ? `https://api.vercel.com/v9/projects?teamId=${VERCEL_TEAM_ID}` : `https://api.vercel.com/v9/projects`;
        const vercelProject = await fetch(vercelApiUrl, {
            method: "POST", headers: { "Authorization": `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: repoName, gitRepository: { type: "github", repo: `${REPO_OWNER}/${repoName}` } })
        }).then(res => res.json());
        if (vercelProject.error) throw new Error(`Vercel Error: ${vercelProject.error.message}`);
        
        const finalDomain = `${subdomain}.${rootDomain}`;
        const addDomainRes = await fetch(`https://api.vercel.com/v10/projects/${repoName}/domains${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''}`, {
            method: "POST", headers: { "Authorization": `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: finalDomain })
        }).then(res => res.json());
        if (addDomainRes.error) throw new Error(`Vercel Domain Error: ${addDomainRes.error.message}`);

        const allDomains = JSON.parse(fs.readFileSync(path.resolve('./data/domains.json'), 'utf-8'));
        const domainInfo = allDomains[rootDomain];
        if (!domainInfo) throw new Error("Konfigurasi untuk domain utama tidak ditemukan.");

        await fetch(`https://api.cloudflare.com/client/v4/zones/${domainInfo.zone}/dns_records`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${domainInfo.apitoken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "CNAME", name: subdomain, content: "cname.vercel-dns.com", proxied: false, ttl: 1 })
        });
        
        return response.status(200).json({ message: "Website berhasil dibuat!", url: `https://${finalDomain}` });
    } catch (error) {
        console.error("Create Website Error:", error);
        return response.status(500).json({ message: error.message });
    } finally {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

export const config = { api: { bodyParser: false } };