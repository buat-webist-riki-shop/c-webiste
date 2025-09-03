import { Octokit } from "@octokit/rest";
import fetch from "node-fetch";
import formidable from "formidable";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { promises as fsPromises } from 'fs';
import { promises as dns } from 'dns';

// --- Konfigurasi ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const REPO_NAME_FOR_JSON = process.env.REPO_NAME_FOR_JSON;
const VERCEL_A_RECORD = '76.76.21.21';

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_EMAIL = process.env.CLOUDFLARE_EMAIL;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const VERCEL_API_BASE = `https://api.vercel.com`;
const VERCEL_HEADERS = { "Authorization": `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" };
const TEAM_QUERY = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';

const CF_HEADERS = {
    "X-Auth-Email": CLOUDFLARE_EMAIL,
    "X-Auth-Key": CLOUDFLARE_API_TOKEN,
    "Content-Type": "application/json"
};

// --- Fungsi Bantuan ---
const DOMAINS_JSON_PATH = path.resolve('./data/domains.json');

const readDomainsJson = () => {
    try {
        if (fs.existsSync(DOMAINS_JSON_PATH)) {
            return JSON.parse(fs.readFileSync(DOMAINS_JSON_PATH, 'utf-8'));
        }
    } catch (e) { console.error("Error reading domains.json:", e); }
    return {};
};

const listAllCloudflareZonesHelper = async () => {
    let allZones = [];
    let page = 1;
    let totalPages;
    try {
        do {
            const response = await fetch(`https://api.cloudflare.com/client/v4/zones?page=${page}&per_page=50`, { headers: CF_HEADERS });
            const result = await response.json();
            if (!result.success) {
                console.error("Cloudflare API Error:", result.errors);
                return []; 
            }
            allZones = allZones.concat(result.result);
            totalPages = result.result_info.total_pages;
            page++;
        } while (page <= totalPages);
        return allZones.map(zone => zone.name); 
    } catch (error) {
        console.error("Failed to fetch from Cloudflare:", error);
        return [];
    }
};

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

async function getAllFilesRecursive(dirPath) {
    const dirents = await fsPromises.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = path.resolve(dirPath, dirent.name);
        return dirent.isDirectory() ? getAllFilesRecursive(res) : res;
    }));
    return Array.prototype.concat(...files);
}

// --- Handler Utama ---
export default async function handler(request, response) {
    if (request.method === 'GET') {
        try {
            const domainsFromJson = Object.keys(readDomainsJson());
            const domainsFromCloudflare = await listAllCloudflareZonesHelper();
            const combinedDomains = [...domainsFromJson, ...domainsFromCloudflare];
            const uniqueDomains = [...new Set(combinedDomains)];
            return response.status(200).json(uniqueDomains);
        } catch (error) {
            console.error("Error in GET handler:", error);
            return response.status(500).json({ message: "Gagal memuat daftar domain gabungan." });
        }
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

// --- Logika POST untuk Admin & Publik ---
async function handleJsonActions(req, res) {
    try {
        const { action, data, adminPassword } = req.body;
        const SETTINGS_PATH = "data/settings.json";
        const APIKEYS_PATH = "data/apikeys.json";
        const DOMAINS_JSON_PATH_GITHUB = "data/domains.json";

        // Aksi publik
        switch(action) {
            case 'getSettings': {
                const settings = await readJsonFromGithub(SETTINGS_PATH);
                const defaultSettings = { whatsappNumber: "", normalPrice: 50000, discountPrice: 25000, discountEndDate: new Date().toISOString() };
                return res.status(200).json({ ...defaultSettings, ...settings });
            }
            case 'checkDomainStatus': {
                const { domain } = data;
                if (!domain) return res.status(400).json({ message: "Nama domain diperlukan." });
                try {
                    const addresses = await dns.resolve(domain);
                    if (addresses.includes(VERCEL_A_RECORD)) {
                        return res.status(200).json({ status: 'success', message: 'Domain sudah terhubung dengan benar.' });
                    }
                } catch (err) {}
                return res.status(200).json({ status: 'pending', message: 'Domain belum terhubung.' });
            }
        }
        
        // Aksi admin
        if (adminPassword !== ADMIN_PASSWORD) return res.status(403).json({ message: "Password admin salah."});

        switch (action) {
            case "updateSettings": {
                if (!data) return res.status(400).json({ message: "Data pengaturan diperlukan." });
                const currentSettings = await readJsonFromGithub(SETTINGS_PATH);
                const newSettings = { ...currentSettings, ...data };
                await writeJsonToGithub(SETTINGS_PATH, newSettings, "Update app settings");
                return res.status(200).json({ message: "Pengaturan berhasil disimpan.", settings: newSettings });
            }
            case "getApiKeys": { const apiKeys = await readJsonFromGithub(APIKEYS_PATH); return res.status(200).json(apiKeys); }
            case "createApiKey": {
                let apiKeys = await readJsonFromGithub(APIKEYS_PATH);
                const { key, duration, unit, isPermanent } = data;
                if (!key || apiKeys[key]) return res.status(400).json({ message: "Nama API Key tidak boleh kosong atau sudah ada."});
                const now = new Date();
                let expires_at = "permanent";
                if (!isPermanent) {
                    const d = parseInt(duration, 10);
                    const expiryDate = new Date(now);
                    if (unit === "days") expiryDate.setDate(expiryDate.getDate() + d);
                    else if (unit === "weeks") expiryDate.setDate(expiryDate.getDate() + (d * 7));
                    else if (unit === "months") expiryDate.setMonth(expiryDate.getMonth() + d);
                    expires_at = expiryDate.toISOString();
                }
                const newKeyData = { created_at: now.toISOString(), expires_at };
                apiKeys[key] = newKeyData;
                await writeJsonToGithub(APIKEYS_PATH, apiKeys, `Create API Key: ${key}`);
                return res.status(200).json({ message: `Kunci '${key}' berhasil dibuat.`, newKey: { name: key, ...newKeyData } });
            }
            case "deleteApiKey": { let apiKeys = await readJsonFromGithub(APIKEYS_PATH); const { key } = data; if (!apiKeys[key]) return res.status(404).json({ message: "API Key tidak ditemukan."}); delete apiKeys[key]; await writeJsonToGithub(APIKEYS_PATH, apiKeys, `Delete API Key: ${key}`); return res.status(200).json({ message: `Kunci '${key}' berhasil dihapus.` }); }
            case "listProjects": { const { data: githubRepos } = await octokit.repos.listForAuthenticatedUser({ sort: 'created', direction: 'desc' }); const vercelRes = await fetch(`${VERCEL_API_BASE}/v9/projects${TEAM_QUERY}`, { headers: VERCEL_HEADERS }); if (!vercelRes.ok) throw new Error("Gagal mengambil data dari Vercel."); const { projects: vercelProjects = [] } = await vercelRes.json(); const allProjects = {}; githubRepos.forEach(repo => { allProjects[repo.name] = { name: repo.name, githubUrl: repo.html_url, isPrivate: repo.private, hasGithub: true, hasVercel: false }; }); vercelProjects.forEach(proj => { if (allProjects[proj.name]) { allProjects[proj.name].hasVercel = true; } else { allProjects[proj.name] = { name: proj.name, githubUrl: null, isPrivate: null, hasGithub: false, hasVercel: true }; } }); return res.status(200).json(Object.values(allProjects)); }
            case "deleteRepo": { const { repoName } = data; if (!repoName) return res.status(400).json({ message: "Nama repo diperlukan." }); await octokit.repos.delete({ owner: REPO_OWNER, repo: repoName }); return res.status(200).json({ message: `Repositori '${repoName}' berhasil dihapus.` }); }
            case "deleteVercelProject": { const { projectName } = data; if (!projectName) return res.status(400).json({ message: "Nama proyek diperlukan." }); const deleteRes = await fetch(`${VERCEL_API_BASE}/v9/projects/${projectName}${TEAM_QUERY}`, { method: 'DELETE', headers: VERCEL_HEADERS }); if (!deleteRes.ok) { const error = await deleteRes.json(); throw new Error(`Gagal menghapus proyek Vercel: ${error.error.message}`); } return res.status(200).json({ message: `Proyek Vercel '${projectName}' berhasil dihapus.` }); }
            case "listAllCloudflareZones": { const zones = await listAllCloudflareZonesHelper(); const fullZoneDetails = await Promise.all(zones.map(name => fetch(`https://api.cloudflare.com/client/v4/zones?name=${name}`, { headers: CF_HEADERS }).then(res => res.json()))); const finalZones = fullZoneDetails.map(z => z.result[0]).filter(Boolean); return res.status(200).json(finalZones); }
            case "addCloudflareZone": { const { domainName } = data; if (!domainName) throw new Error("Nama domain diperlukan."); const zonesResponse = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=1`, { headers: CF_HEADERS }); const zonesResult = await zonesResponse.json(); if (!zonesResult.success) throw new Error(zonesResult.errors[0]?.message || "Gagal memverifikasi akun Cloudflare."); if (zonesResult.result.length === 0 && !process.env.CLOUDFLARE_ACCOUNT_ID) { throw new Error("Tidak dapat menemukan Account ID Cloudflare. Harap tambahkan di .env atau pastikan ada minimal 1 domain di akun Anda."); } const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || zonesResult.result[0].account.id; const createResponse = await fetch(`https://api.cloudflare.com/client/v4/zones`, { method: 'POST', headers: CF_HEADERS, body: JSON.stringify({ name: domainName, account: { id: accountId } }) }); const createResult = await createResponse.json(); if (!createResult.success) throw new Error(createResult.errors[0]?.message || "Gagal menambahkan domain ke Cloudflare."); return res.status(200).json({ message: `Domain ${domainName} berhasil ditambahkan.`, nameservers: createResult.result.name_servers, domain: createResult.result.name }); }
            case "listDnsRecords": { const { zoneId } = data; if (!zoneId) throw new Error("Zone ID diperlukan."); let allRecords = []; let page = 1; let totalPages; do { const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?page=${page}&per_page=100`, { headers: CF_HEADERS }); const result = await response.json(); if (!result.success) throw new Error("Gagal mengambil data DNS dari Cloudflare."); allRecords = allRecords.concat(result.result); totalPages = result.result_info.total_pages; page++; } while (page <= totalPages); return res.status(200).json(allRecords); }
            case "bulkDeleteDnsRecords": { const { zoneId, recordIds } = data; if (!zoneId || !recordIds || recordIds.length === 0) throw new Error("Data tidak lengkap untuk hapus DNS."); const results = await Promise.all(recordIds.map(recordId => fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE', headers: CF_HEADERS }))); const successCount = results.filter(r => r.ok).length; return res.status(200).json({ message: `${successCount} dari ${recordIds.length} record DNS berhasil dihapus.` }); }
            case "bulkDeleteCloudflareZones": { const { zoneIds } = data; if (!zoneIds || zoneIds.length === 0) throw new Error("Tidak ada zona yang dipilih untuk dihapus."); const results = await Promise.all(zoneIds.map(zoneId => fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, { method: 'DELETE', headers: CF_HEADERS }))); const successCount = results.filter(r => r.ok).length; return res.status(200).json({ message: `${successCount} dari ${zoneIds.length} zona berhasil dihapus.` }); }
            
            case "getManagedDomains": {
                const domains = await readJsonFromGithub(DOMAINS_JSON_PATH_GITHUB);
                return res.status(200).json(domains);
            }
            case "addManagedDomain": {
                const { domain, zone, apitoken } = data;
                if (!domain || !zone || !apitoken) {
                    return res.status(400).json({ message: "Semua field (domain, zone, apitoken) wajib diisi." });
                }
                let domains = await readJsonFromGithub(DOMAINS_JSON_PATH_GITHUB);
                if (domains[domain]) {
                    return res.status(409).json({ message: `Domain "${domain}" sudah ada di dalam file.` });
                }
                domains[domain] = { zone, apitoken };
                await writeJsonToGithub(DOMAINS_JSON_PATH_GITHUB, domains, `Add managed domain: ${domain}`);
                return res.status(200).json({ message: `Domain "${domain}" berhasil ditambahkan.`, domains });
            }
            case "deleteManagedDomains": {
                const { domainsToDelete } = data;
                 if (!domainsToDelete || domainsToDelete.length === 0) {
                    return res.status(400).json({ message: "Tidak ada domain yang dipilih untuk dihapus." });
                }
                let domains = await readJsonFromGithub(DOMAINS_JSON_PATH_GITHUB);
                let deletedCount = 0;
                domainsToDelete.forEach(domain => {
                    if (domains[domain]) {
                        delete domains[domain];
                        deletedCount++;
                    }
                });
                await writeJsonToGithub(DOMAINS_JSON_PATH_GITHUB, domains, `Delete managed domains: ${domainsToDelete.join(', ')}`);
                return res.status(200).json({ message: `${deletedCount} domain berhasil dihapus.`, domains });
            }

            default:
                return res.status(400).json({ message: "Aksi tidak dikenal." });
        }
    } catch (error) {
        console.error("JSON Action Error:", error.message);
        return res.status(500).json({ message: error.message });
    }
}


// --- Logika POST untuk Create Website ---
async function handleCreateWebsite(request, response) {
    const tempDir = path.join("/tmp", `website-${Date.now()}`);
    try {
        await fsPromises.mkdir(tempDir);
        const form = formidable({ maxFileSize: 50 * 1024 * 1024, uploadDir: tempDir });
        const [fields, files] = await form.parse(request);

        const { subdomain, rootDomain, apiKey } = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]]));
        const uploadedFile = files.websiteFile[0];
        if (!subdomain || !rootDomain || !apiKey || !uploadedFile) throw new Error("Semua kolom wajib diisi.");

        const validApiKeys = await readJsonFromGithub("data/apikeys.json");
        const keyData = validApiKeys[apiKey];
        if (!keyData || (keyData.expires_at !== "permanent" && new Date() > new Date(keyData.expires_at))) {
           throw new Error("API Key tidak valid atau sudah kadaluwarsa.");
        }
        
        // [MODIFIKASI] Membuat nama unik untuk proyek dan repo
        const randomSuffix = Math.floor(100 + Math.random() * 900); // Angka acak 3 digit
        const uniqueProjectName = `${subdomain}${randomSuffix}`;
        
        // Menggunakan nama unik untuk Vercel dan GitHub
        const repoName = uniqueProjectName; 

        const vercelCheckRes = await fetch(`${VERCEL_API_BASE}/v9/projects/${repoName}${TEAM_QUERY}`, { headers: VERCEL_HEADERS });
        if (vercelCheckRes.ok) throw new Error(`Nama proyek "${repoName}" sudah digunakan di Vercel.`);
        try {
            await octokit.repos.get({ owner: REPO_OWNER, repo: repoName });
            throw new Error(`Repositori "${repoName}" sudah ada di GitHub.`);
        } catch (error) {
            if (error.status !== 404) throw error;
        }

        const extractDir = path.join(tempDir, "extracted");
        await fsPromises.mkdir(extractDir);
        
        if (uploadedFile.mimetype === "application/zip") {
            const zip = new AdmZip(uploadedFile.filepath);
            zip.extractAllTo(extractDir, true);
        } else if (uploadedFile.mimetype === "text/html") {
            await fsPromises.rename(uploadedFile.filepath, path.join(extractDir, "index.html"));
        } else throw new Error("Format file tidak didukung.");
        
        let uploadRoot = extractDir;
        const itemsInExtractDir = await fsPromises.readdir(extractDir);
        if (itemsInExtractDir.length === 1) {
            const singleItemPath = path.join(extractDir, itemsInExtractDir[0]);
            const stats = await fsPromises.stat(singleItemPath);
            if (stats.isDirectory()) {
                uploadRoot = singleItemPath;
            }
        }
        
        await octokit.repos.createForAuthenticatedUser({ name: repoName, private: false });

        const packageJsonPath = path.join(uploadRoot, 'package.json');
        const indexHtmlPath = path.join(uploadRoot, 'index.html');
        let isNodeProject = fs.existsSync(packageJsonPath);

        if (isNodeProject) {
            const vercelJsonPath = path.join(uploadRoot, 'vercel.json');
            if (!fs.existsSync(vercelJsonPath)) {
                const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, 'utf-8'));
                const mainFile = packageJson.main || 'index.js';
                if (!fs.existsSync(path.join(uploadRoot, mainFile))) {
                    throw new Error(`Proyek Node.js terdeteksi, tapi file utama '${mainFile}' (dari package.json) tidak ditemukan.`);
                }
                const vercelConfig = {
                    version: 2,
                    builds: [{ src: mainFile, use: "@vercel/node" }],
                    routes: [{ src: "/(.*)", dest: mainFile }]
                };
                await fsPromises.writeFile(vercelJsonPath, JSON.stringify(vercelConfig, null, 2));
            }
        } else if (!fs.existsSync(indexHtmlPath)) {
            throw new Error("Upload tidak valid. Harus berupa proyek statis (mengandung index.html) atau proyek Node.js (mengandung package.json).");
        }
        
        const filesToUpload = await getAllFilesRecursive(uploadRoot);
        for (const filePath of filesToUpload) {
            const content = await fsPromises.readFile(filePath, { encoding: 'base64' });
            const githubPath = path.relative(uploadRoot, filePath).replace(/\\/g, "/");
            if (githubPath) {
                await octokit.repos.createOrUpdateFileContents({
                    owner: REPO_OWNER, repo: repoName, path: githubPath,
                    message: `Commit: ${githubPath}`, content
                });
            }
        }
        
        const vercelProjectConfig = { name: repoName, gitRepository: { type: "github", repo: `${REPO_OWNER}/${repoName}` } };
        if (isNodeProject) {
            vercelProjectConfig.framework = "express";
        }

        const vercelProjectRes = await fetch(`${VERCEL_API_BASE}/v9/projects${TEAM_QUERY}`, {
            method: "POST", headers: VERCEL_HEADERS,
            body: JSON.stringify(vercelProjectConfig)
        });
        const vercelProject = await vercelProjectRes.json();
        if (vercelProject.error) throw new Error(`Vercel Error: ${vercelProject.error.message}`);
        
        await fetch(`${VERCEL_API_BASE}/v13/deployments${TEAM_QUERY}`, {
            method: 'POST', headers: VERCEL_HEADERS,
            body: JSON.stringify({ name: repoName, gitSource: { type: 'github', repoId: vercelProject.link.repoId, ref: 'main' }, target: 'production' })
        });
        
        // [MODIFIKASI] Menggunakan 'subdomain' asli untuk domain kustom
        const finalDomain = `${subdomain}.${rootDomain}`;
        const addDomainRes = await fetch(`${VERCEL_API_BASE}/v10/projects/${repoName}/domains${TEAM_QUERY}`, {
            method: "POST", headers: VERCEL_HEADERS, body: JSON.stringify({ name: finalDomain })
        });
        const addDomainResult = await addDomainRes.json();
        
        const allDomains = readDomainsJson();
        const domainInfo = allDomains[rootDomain];
        
        let cfAuthHeaderForDns;

        if (domainInfo && domainInfo.apitoken) {
            cfAuthHeaderForDns = { "Authorization": `Bearer ${domainInfo.apitoken}`, "Content-Type": "application/json" };
        } else {
            cfAuthHeaderForDns = CF_HEADERS;
        }
        
        const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, { headers: CF_HEADERS });
        const zoneData = await zoneRes.json();
        if (!zoneData.success || zoneData.result.length === 0) {
            throw new Error(`Tidak dapat menemukan Zone ID untuk domain ${rootDomain}. Pastikan domain ada di akun Cloudflare.`);
        }
        const zoneId = zoneData.result[0].id;

        if (addDomainResult.error?.code === 'domain_requires_verification') {
            console.log("Verifikasi domain diperlukan oleh Vercel.");
            
            const txtVerification = addDomainResult.error.verification?.find(v => v.type === 'TXT');

            if (txtVerification) {
                console.log("Metode verifikasi TXT terdeteksi. Memulai proses...");
                const txtName = txtVerification.domain; 
                const txtValue = txtVerification.value;
                
                console.log(`Menambahkan TXT record: Name=${txtName}, Value=${txtValue}`);
                const createTxtRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                    method: "POST", headers: cfAuthHeaderForDns,
                    body: JSON.stringify({ type: 'TXT', name: txtName, content: txtValue, ttl: 60 })
                });
                const createTxtResult = await createTxtRes.json();
                if (!createTxtResult.success) {
                    console.error("Gagal membuat TXT record di Cloudflare:", createTxtResult.errors);
                    throw new Error(`Gagal membuat record verifikasi di Cloudflare: ${createTxtResult.errors[0]?.message}`);
                }

                console.log("Menunggu 60 detik untuk propagasi DNS...");
                await new Promise(resolve => setTimeout(resolve, 60000));

                console.log("Mencoba memverifikasi domain di Vercel...");
                const verifyRes = await fetch(`${VERCEL_API_BASE}/v9/projects/${repoName}/domains/${finalDomain}/verify${TEAM_QUERY}`, { method: "POST", headers: VERCEL_HEADERS });
                const verifyResult = await verifyRes.json();

                if (!verifyRes.ok || verifyResult.error) {
                     const errorMessage = verifyResult.error?.message || 'Verifikasi gagal tanpa pesan spesifik.';
                     console.error("Gagal verifikasi otomatis:", errorMessage);
                     throw new Error(`Verifikasi domain gagal: ${errorMessage}. DNS mungkin butuh waktu lebih lama. Coba lagi dalam beberapa menit.`);
                }
                console.log("Verifikasi domain TXT berhasil!");

            } else {
                console.log("Vercel memerlukan verifikasi, tetapi tidak menyediakan metode TXT. Akan dilanjutkan dengan A record saja.");
            }
        } else if (addDomainResult.error) {
            throw new Error(`Gagal menambahkan domain ke Vercel: ${addDomainResult.error.message}`);
        }

        console.log(`Membersihkan record A lama untuk ${finalDomain} (jika ada)...`);
        const existingRecordsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${finalDomain}`, { headers: cfAuthHeaderForDns });
        const existingRecords = await existingRecordsRes.json();
        if (existingRecords.success && existingRecords.result.length > 0) {
            for (const record of existingRecords.result) {
                await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`, { method: 'DELETE', headers: cfAuthHeaderForDns });
            }
        }

        console.log(`Menambahkan A record baru untuk ${subdomain} -> ${VERCEL_A_RECORD}`);
        await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
            method: "POST", headers: cfAuthHeaderForDns,
            body: JSON.stringify({ type: 'A', name: subdomain, content: VERCEL_A_RECORD, proxied: false, ttl: 60 })
        });
        
        const vercelUrl = vercelProject.alias?.find(a => a.domain.endsWith('.vercel.app'))?.domain || `${repoName}.vercel.app`;

        return response.status(200).json({
            message: "Proses pembuatan website dimulai!",
            siteData: { projectName: repoName, vercelUrl: `https://${vercelUrl}`, customUrl: `https://${finalDomain}`, status: 'pending' }
        });
    } catch (error) {
        console.error("Create Website Error:", error);
        return response.status(500).json({ message: error.message });
    } finally {
        if (fs.existsSync(tempDir)) await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
}

export const config = { api: { bodyParser: false } };