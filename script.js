// public/script.js

document.addEventListener('DOMContentLoaded', () => {
    // Tandai waktu mulai saat script pertama kali dijalankan
    const startTime = performance.now();

    // Elemen UI
    const creatorForm = document.getElementById('creator-form');
    const subdomainInput = document.getElementById('subdomain-name');
    const rootDomainSelect = document.getElementById('root-domain-select');
    const websiteFileInput = document.getElementById('website-file');
    const fileNameSpan = document.getElementById('file-name-span');
    const userApiKeyInput = document.getElementById('user-api-key');
    const createBtn = document.getElementById('create-btn');
    const btnText = document.getElementById('btn-text');
    const sitesContainer = document.getElementById('created-sites-container');
    const sitesList = document.getElementById('sites-list');
    const subdomainStatus = document.getElementById('subdomain-status');
    
    // Elemen Modal
    const detailsModal = document.getElementById('details-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalVercelUrl = document.getElementById('modal-vercel-url');
    const modalCustomUrl = document.getElementById('modal-custom-url');
    const modalCheckStatusBtn = document.getElementById('modal-check-status-btn');

    // Elemen Tema & Loading
    const themeToggle = document.getElementById('theme-toggle');
    const loadingOverlay = document.getElementById('loading-overlay');
    const body = document.body;
    let debounceTimer;
    let toastTimeout;

    // --- NOTIFIKASI, TEMA, & LOADING ---
    const showToast = (message, type = 'info') => {
        const toast = document.getElementById('toast-notification');
        clearTimeout(toastTimeout);
        const iconMap = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
        toast.innerHTML = `<i class="fas ${iconMap[type]}"></i> ${message}`;
        toast.className = '';
        toast.classList.add(type);
        toast.classList.add('show');
        toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 4000);
    };

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            body.classList.remove('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    };
    
    themeToggle.addEventListener('click', () => {
        const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('theme_preference_v1', newTheme);
        applyTheme(newTheme);
    });

    // --- MANAJEMEN DATA (localStorage) ---
    const getSites = () => JSON.parse(localStorage.getItem('createdSites_v1')) || [];
    const saveSite = (siteData) => {
        const sites = getSites();
        sites.unshift(siteData);
        localStorage.setItem('createdSites_v1', JSON.stringify(sites));
    };
    const updateSiteStatus = (projectName, newStatus) => {
        const sites = getSites();
        const siteIndex = sites.findIndex(s => s.projectName === projectName);
        if (siteIndex > -1) {
            sites[siteIndex].status = newStatus;
            localStorage.setItem('createdSites_v1', JSON.stringify(sites));
        }
        return sites[siteIndex];
    };

    // --- FUNGSI TAMPILAN (RENDER) ---
    const renderSitesList = () => {
        const sites = getSites();
        if (sites.length === 0) {
            sitesContainer.style.display = 'none';
            return;
        }
        sitesContainer.style.display = 'block';
        sitesList.innerHTML = '';
        sites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'sites-list-item';
            item.dataset.project = site.projectName;
            const statusClass = site.status === 'success' ? 'success' : 'pending';
            const statusText = site.status === 'success' ? 'Aktif' : 'Menunggu';
            item.innerHTML = `
                <div class="site-info">
                    <h3>${site.customUrl.replace('https://','')}</h3>
                    <p>${site.vercelUrl.replace('https://','')}</p>
                </div>
                <span class="status ${statusClass}">${statusText}</span>
            `;
            sitesList.appendChild(item);
        });
    };
    
    const showDetailsModal = (siteData) => {
        modalVercelUrl.href = siteData.vercelUrl;
        modalVercelUrl.textContent = siteData.vercelUrl.replace('https://','');
        modalCustomUrl.href = siteData.customUrl;
        modalCustomUrl.textContent = siteData.customUrl.replace('https://','');
        modalCheckStatusBtn.dataset.project = siteData.projectName;
        modalCheckStatusBtn.dataset.domain = siteData.customUrl.replace('https://','');
        updateModalStatus(siteData.status);
        detailsModal.classList.add('show');
    };

    const updateModalStatus = (status) => {
        modalCheckStatusBtn.disabled = false;
        
        if (status === 'success') {
            modalCheckStatusBtn.className = 'status success';
            modalCheckStatusBtn.innerHTML = '<i class="fas fa-check"></i> Aktif';
            modalCheckStatusBtn.disabled = true;
        } else {
            modalCheckStatusBtn.className = 'check-status-btn status pending';
            modalCheckStatusBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Cek Status';
        }
    };

    // --- MODIFIKASI KUNCI: Menambahkan batas waktu (timeout) pada fungsi ini ---
    const fetchDomains = async () => {
        // Buat AbortController untuk membatalkan fetch jika terlalu lama
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // Batas waktu 8 detik

        try {
            const response = await fetch('/api/create-website', {
                signal: controller.signal // Kaitkan sinyal abort ke fetch
            });
            clearTimeout(timeoutId); // Batalkan timeout jika fetch berhasil

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.message || 'Gagal memuat domain dari server.');
            }
            
            const domains = await response.json();
            rootDomainSelect.innerHTML = '';
            if (domains.length > 0) {
                domains.forEach(domain => {
                    const option = document.createElement('option');
                    option.value = domain;
                    option.textContent = domain;
                    rootDomainSelect.appendChild(option);
                });
            } else {
                 rootDomainSelect.innerHTML = '<option value="">Tidak ada domain</option>';
                 showToast('Admin belum menambahkan domain utama.', 'error');
            }
        } catch (error) {
            console.error(error);
            rootDomainSelect.innerHTML = '<option value="">Gagal memuat domain</option>';
            // Beri pesan error yang jelas kepada pengguna
            if (error.name === 'AbortError') {
                throw new Error('Server tidak merespons. Gagal memuat daftar domain.');
            }
            throw error; // Lemparkan error lainnya
        }
    };
    
    // --- VALIDASI & INTERAKSI FORM ---
    const checkSubdomainAvailability = async () => {
        const subdomain = subdomainInput.value;
        const rootDomain = rootDomainSelect.value;
        if (!subdomain || !rootDomain) {
            subdomainStatus.textContent = '';
            return;
        }
        subdomainStatus.textContent = 'Memeriksa...';
        subdomainStatus.className = '';

        try {
            const response = await fetch('/api/create-website', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'checkSubdomain', data: { subdomain, rootDomain } })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            if (result.available) {
                subdomainStatus.textContent = 'Tersedia';
                subdomainStatus.className = 'available';
            } else {
                subdomainStatus.textContent = 'Sudah Digunakan';
                subdomainStatus.className = 'taken';
            }
        } catch (error) {
            subdomainStatus.textContent = 'Error';
            subdomainStatus.className = 'taken';
        }
    };
    
    subdomainInput.addEventListener('input', (e) => {
        const originalValue = e.target.value;
        const formattedValue = originalValue.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (originalValue !== formattedValue) {
            e.target.value = formattedValue;
        }
        
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (e.target.value) {
                checkSubdomainAvailability();
            } else {
                subdomainStatus.textContent = '';
            }
        }, 500);
    });
    
    rootDomainSelect.addEventListener('change', checkSubdomainAvailability);

    websiteFileInput.addEventListener('change', () => {
        fileNameSpan.textContent = websiteFileInput.files.length > 0 ? websiteFileInput.files[0].name : 'Pilih file...';
    });

    creatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (subdomainStatus.classList.contains('taken')) {
            return showToast('Nama domain sudah digunakan!', 'error');
        }
        if (!subdomainInput.value || !rootDomainSelect.value || !websiteFileInput.files[0] || !userApiKeyInput.value) {
            return showToast('Harap isi semua kolom!', 'error');
        }

        createBtn.disabled = true;
        btnText.textContent = 'Memproses...';
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        createBtn.prepend(spinner);

        const formData = new FormData();
        formData.append('subdomain', subdomainInput.value.trim());
        formData.append('rootDomain', rootDomainSelect.value);
        formData.append('apiKey', userApiKeyInput.value.trim());
        formData.append('websiteFile', websiteFileInput.files[0]);

        try {
            const response = await fetch('/api/create-website', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            saveSite(result.siteData);
            renderSitesList();
            showDetailsModal(result.siteData);
            creatorForm.reset();
            fileNameSpan.textContent = 'Pilih file...';
            subdomainStatus.textContent = '';
            showToast('Website berhasil dibuat!', 'success');

        } catch (error) {
            showToast(`Gagal: ${error.message}`, 'error');
        } finally {
            createBtn.disabled = false;
            btnText.textContent = 'Buat Website';
            spinner.remove();
        }
    });

    modalCloseBtn.addEventListener('click', () => detailsModal.classList.remove('show'));
    detailsModal.addEventListener('click', (e) => {
        if(e.target === detailsModal) {
            detailsModal.classList.remove('show');
        }
    });

    sitesList.addEventListener('click', (e) => {
        const item = e.target.closest('.sites-list-item');
        if (!item) return;
        const sites = getSites();
        const siteData = sites.find(s => s.projectName === item.dataset.project);
        if (siteData) showDetailsModal(siteData);
    });

    modalCheckStatusBtn.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const { domain, project } = btn.dataset;
        
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:15px; height:15px; border-width:2px; border-top-color: var(--primary-color);"></div> Memeriksa...';
        
        try {
            const response = await fetch('/api/create-website', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'checkDomainStatus', data: { domain } })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            
            let finalStatus = result.status;
            const updatedSite = updateSiteStatus(project, finalStatus);
            if(updatedSite) updateModalStatus(updatedSite.status);
            
            renderSitesList();
            showToast(result.message, finalStatus);

        } catch (error) {
            showToast(error.message, 'error');
            updateModalStatus('pending');
        }
    });
    
    // --- INISIALISASI ---
    const initializePage = async () => {
        const savedTheme = localStorage.getItem('theme_preference_v1') || 'light';
        applyTheme(savedTheme);
        renderSitesList();
        
        try {
            await fetchDomains();
        } catch(error) {
            console.error("Inisialisasi gagal:", error);
            showToast(error.message, "error");
        } finally {
            const minimumLoadingTime = 300;
            const elapsedTime = performance.now() - startTime;
            const remainingTime = minimumLoadingTime - elapsedTime;

            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
            }, Math.max(0, remainingTime));
        }
    };
    
    initializePage();
});