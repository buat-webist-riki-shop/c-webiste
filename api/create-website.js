import { Octokit } from "@octokit/rest";
import fetch from "node-fetch";
import formidable from "formidable";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { promises as dns } from 'dns';

// --- Konfigurasi ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const REPO_NAME_FOR_JSON = process.env.REPO_NAME_FOR_JSON;
const VERCEL_A_RECORD = '76.76.21.21';

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const VERCEL_API_BASE = `https://api.vercel.com`;
const VERCEL_HEADERS = { "Authorization": `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" };
const TEAM_QUERY = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

// --- Helper Functions ---
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

const getAllFiles = (dirPath, arrayOfFiles) => {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(file => {
        if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
            arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
        } else {
            arrayOfFiles.push(path.join(dirPath, file));
        }
    });
    return arrayOfFiles;
};

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
            return handleJsonActions(request, response);
        }
    }
    return response.status(405).json({ message: 'Metode tidak diizinkan.' });
}

// --- Logika GET ---
async function handleGetDomains(req, res) {
    try {
        const domainsData = JSON.parse(fs.readFileSync(path.resolve('./data/domains.json'), 'utf-8'));
        return res.status(200).json(Object.keys(domainsData));
    } catch (error) {
        return res.status(500).json({ message: "Gagal memuat daftar domain." });
    }
}

// --- Logika POST untuk Admin, Cek Status, Cek Subdomain ---
async function handleJsonActions(req, res) {
    try {
        const { action, data, adminPassword } = req.body;
        
        // Aksi publik (tidak perlu password)
        switch(action) {
            case 'checkDomainStatus': {
                const { domain } = data;
                if (!domain) return res.status(400).json({ message: "Nama domain diperlukan." });
                try {
                    const addresses = await dns.resolve(domain);
                    if (addresses.includes(VERCEL_A_RECORD)) {
                        return res.status(200).json({ status: 'success', message: 'Domain sudah terhubung dengan benar.' });
                    }
                } catch (err) {
                     // Error (seperti NXDOMAIN) berarti belum terhubung
                }
                return res.status(200).json({ status: 'pending', message: 'Domain belum terhubung atau sedang dalam proses.' });
            }
            case 'checkSubdomain': {
                const { subdomain, rootDomain } = data;
                if (!subdomain || !rootDomain) return res.status(400).json({ message: "Subdomain dan domain utama diperlukan." });
                
                // Cek ketersediaan di Vercel (untuk custom domain)
                const finalDomain = `${subdomain}.${rootDomain}`;
                const domainCheckRes = await fetch(`${VERCEL_API_BASE}/v4/domains/status${TEAM_QUERY}&name=${finalDomain}`, { headers: VERCEL_HEADERS });
                const domainResult = await domainCheckRes.json();
                if (domainResult.available === false) {
                     return res.status(200).json({ available: false, message: 'Nama domain kustom sudah digunakan.' });
                }

                // Cek ketersediaan project di Vercel
                const projectCheckRes = await fetch(`${VERCEL_API_BASE}/v9/projects/${subdomain}${TEAM_QUERY}`, { headers: VERCEL_HEADERS });
                if (projectCheckRes.ok) { // Jika status 200 OK, berarti proyek sudah ada
                    return res.status(200).json({ available: false, message: 'Nama website ini sudah digunakan di Vercel.' });
                }

                return res.status(200).json({ available: true });
            }
        }
        
        // Aksi admin (perlu password)
        if (adminPassword !== ADMIN_PASSWORD) return res.status(403).json({ message: "Password admin salah."});

        const APIKEYS_PATH = "data/apikeys.json";
        let apiKeys = await readJsonFromGithub(APIKEYS_PATH);

        switch (action) {
            case "getApiKeys":
                return res.status(200).json(apiKeys);
            case "createApiKey": {
                const { key, duration, unit, isPermanent } = data;
                if (!key || apiKeys[key]) return res.status(400).json({ message: "Nama API Key tidak boleh kosong atau sudah ada."});
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
                return res.status(200).json({ message: `Kunci '${key}' berhasil dibuat.` });
            }
            case "deleteApiKey": {
                const { key } = data;
                if (!apiKeys[key]) return res.status(404).json({ message: "API Key tidak ditemukan."});
                delete apiKeys[key];
                await writeJsonToGithub(APIKEYS_PATH, apiKeys, `Delete API Key: ${key}`);
                return res.status(200).json({ message: `Kunci '${key}' berhasil dihapus.` });
            }
            case "getProjects": {
                const projectsRes = await fetch(`${VERCEL_API_BASE}/v9/projects${TEAM_QUERY}`, { headers: VERCEL_HEADERS });
                const { projects } = await projectsRes.json();
                const filteredProjects = projects
                    .filter(p => p.link && p.link.type === 'github' && p.link.owner === REPO_OWNER)
                    .map(p => ({
                        projectName: p.name,
                        githubRepo: p.link.repo,
                        domains: p.alias.map(a => a.domain)
                    }));
                return res.status(200).json(filteredProjects);
            }
            case "deleteProject": {
                const { projectName, githubRepo } = data;
                if (!projectName || !githubRepo) return res.status(400).json({ message: "Nama proyek dan repo GitHub diperlukan." });
                
                // Hapus Proyek Vercel
                const vercelDeleteRes = await fetch(`${VERCEL_API_BASE}/v9/projects/${projectName}${TEAM_QUERY}`, { method: 'DELETE', headers: VERCEL_HEADERS });
                if (!vercelDeleteRes.ok) {
                    const error = await vercelDeleteRes.json();
                    return res.status(vercelDeleteRes.status).json({ message: `Gagal menghapus proyek Vercel: ${error.error.message}` });
                }

                // Hapus Repo GitHub
                const githubDeleteRes = await octokit.repos.delete({ owner: REPO_OWNER, repo: githubRepo });
                if (githubDeleteRes.status !== 204) {
                     return res.status(500).json({ message: `Proyek Vercel dihapus, tapi gagal menghapus repo GitHub.` });
                }

                return res.status(200).json({ message: `Proyek "${projectName}" dan repo "${githubRepo}" berhasil dihapus.`});
            }
            default:
                return res.status(400).json({ message: "Aksi tidak dikenal." });
        }
    } catch (error) {
        console.error("JSON Action Error:", error);
        return res.status(500).json({ message: error.message });
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
        if (uploadedFile.mimetype === "application/zip") {
            const zip = new AdmZip(uploadedFile.filepath);
            zip.extractAllTo(tempDir, true);
        } else if (uploadedFile.mimetype === "text/html") {
            fs.renameSync(uploadedFile.filepath, path.join(tempDir, "index.html"));
        } else throw new Error("Format file tidak didukung.");
        
        let uploadRoot = tempDir;
        const entries = fs.readdirSync(tempDir);
        if (entries.length === 1 && fs.statSync(path.join(tempDir, entries[0])).isDirectory()) {
            uploadRoot = path.join(tempDir, entries[0]);
        }
        
        if (!fs.existsSync(path.join(uploadRoot, "index.html"))) {
            throw new Error("File 'index.html' tidak ditemukan di dalam root file yang diunggah.");
        }

        const vercelProjectName = subdomain.replace(/[^a-z0-9-]/gi, '');
        const githubRepoName = `${vercelProjectName}-${Math.floor(100 + Math.random() * 900)}`;

        await octokit.repos.createForAuthenticatedUser({ name: githubRepoName, private: true });
        
        const allFiles = getAllFiles(uploadRoot);
        for (const filePath of allFiles) {
            const content = fs.readFileSync(filePath, "base64");
            const githubPath = path.relative(uploadRoot, filePath).replace(/\\/g, "/");
            await octokit.repos.createOrUpdateFileContents({
                owner: REPO_OWNER, repo: githubRepoName, path: githubPath,
                message: `Initial commit: ${githubPath}`, content
            });
        }
        
        const vercelProject = await fetch(`${VERCEL_API_BASE}/v9/projects${TEAM_QUERY}`, {
            method: "POST", headers: VERCEL_HEADERS,
            body: JSON.stringify({ name: vercelProjectName, gitRepository: { type: "github", repo: `${REPO_OWNER}/${githubRepoName}` }, framework: null })
        }).then(res => res.json());

        if (vercelProject.error) throw new Error(`Vercel Error: ${vercelProject.error.message}`);
        
        // Dapatkan URL vercel dari response
        const vercelUrl = vercelProject.alias.find(a => a.domain.endsWith('.vercel.app')).domain;
        
        await fetch(`${VERCEL_API_BASE}/v13/deployments${TEAM_QUERY}`, {
            method: 'POST', headers: VERCEL_HEADERS,
            body: JSON.stringify({ name: vercelProjectName, gitSource: { type: 'github', repoId: vercelProject.link.repoId, ref: 'main' }, target: 'production' })
        });

        const finalDomain = `${subdomain}.${rootDomain}`;
        await fetch(`${VERCEL_API_BASE}/v10/projects/${vercelProjectName}/domains${TEAM_QUERY}`, {
            method: "POST", headers: VERCEL_HEADERS,
            body: JSON.stringify({ name: finalDomain })
        });
        
        const allDomains = JSON.parse(fs.readFileSync(path.resolve('./data/domains.json'), 'utf-8'));
        const domainInfo = allDomains[rootDomain];
        if (!domainInfo) throw new Error("Konfigurasi untuk domain utama tidak ditemukan.");
        
        const cfAuthHeader = { "Authorization": `Bearer ${domainInfo.apitoken}` };
        const recordsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${domainInfo.zone}/dns_records?name=${finalDomain}`, { headers: cfAuthHeader }).then(res => res.json());
        if (recordsRes.success && recordsRes.result.length > 0) {
            for (const record of recordsRes.result) {
                await fetch(`https://api.cloudflare.com/client/v4/zones/${domainInfo.zone}/dns_records/${record.id}`, { method: 'DELETE', headers: cfAuthHeader });
            }
        }

        await fetch(`https://api.cloudflare.com/client/v4/zones/${domainInfo.zone}/dns_records`, {
            method: "POST", headers: { ...cfAuthHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ type: 'A', name: subdomain, content: VERCEL_A_RECORD, proxied: false, ttl: 1 })
        });
        
        return response.status(200).json({
            message: "Proses pembuatan website dimulai!",
            siteData: { 
                projectName: vercelProjectName,
                githubRepo: githubRepoName, // Simpan juga nama repo untuk referensi
                vercelUrl: `https://${vercelUrl}`, 
                customUrl: `https://${finalDomain}`, 
                status: 'pending' 
            }
        });
    } catch (error) {
        console.error("Create Website Error:", error);
        return response.status(500).json({ message: error.message });
    } finally {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

export const config = { api: { bodyParser: false } };