document.addEventListener('DOMContentLoaded', () => {
    const startTime = performance.now();

    // Elemen UI
    const creatorForm = document.getElementById('creator-form');
    const subdomainInput = document.getElementById('subdomain-name');
    const rootDomainSelect = document.getElementById('root-domain-select');
    const websiteFileInput = document.getElementById('website-file');
    const fileNameSpan = document.getElementById('file-name-span');
    const userApiKeyInput = document.getElementById('user-api-key');
    const createBtn = document.getElementById('create-btn');
    const sitesContainer = document.getElementById('created-sites-container');
    const sitesList = document.getElementById('sites-list');
    const subdomainStatus = document.getElementById('subdomain-status');
    
    const detailsModal = document.getElementById('details-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalVercelUrl = document.getElementById('modal-vercel-url');
    const modalCustomUrl = document.getElementById('modal-custom-url');
    const modalCheckStatusBtn = document.getElementById('modal-check-status-btn');

    const themeToggle = document.getElementById('theme-toggle');
    const loadingOverlay = document.getElementById('loading-overlay');
    const body = document.body;
    let debounceTimer;
    let toastTimeout;

    const showToast = (message, type = 'info') => {
        const toast = document.getElementById('toast-notification');
        clearTimeout(toastTimeout);
        const iconMap = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
        toast.innerHTML = `<i class="fas ${iconMap[type]}"></i> ${message}`;
        toast.className = '';
        toast.classList.add(type);
        toast.classList.add('show');
        toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 4000); // Durasi notif lebih lama
    };

    const applyTheme = (theme) => {
        if (theme === 'dark') body.classList.add('dark-mode');
        else body.classList.remove('dark-mode');
        themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    };
    
    themeToggle.addEventListener('click', () => {
        const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('theme_preference_v1', newTheme);
        applyTheme(newTheme);
    });

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
            return sites[siteIndex];
        }
        return null;
    };

    const renderSitesList = () => {
        const sites = getSites();
        sitesContainer.style.display = sites.length > 0 ? 'block' : 'none';
        sitesList.innerHTML = '';
        sites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'sites-list-item';
            item.dataset.project = site.projectName;
            item.innerHTML = `
                <div class="site-info">
                    <h3>${site.customUrl.replace('https://','')}</h3>
                    <p>${site.vercelUrl.replace('https://','')}</p>
                </div>
                <span class="status ${site.status}">${site.status === 'success' ? 'Aktif' : 'Menunggu'}</span>
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
        modalCheckStatusBtn.disabled = status === 'success';
        modalCheckStatusBtn.className = `check-status-btn status ${status}`;
        if(status === 'success') {
             modalCheckStatusBtn.innerHTML = 'Aktif';
        } else {
             modalCheckStatusBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Cek Status';
        }
    };

    const fetchDomains = async () => {
        try {
            const response = await fetch('/api/create-website');
            if (!response.ok) throw new Error('Gagal memuat domain');
            const domains = await response.json();
            rootDomainSelect.innerHTML = domains.length > 0 
                ? domains.map(d => `<option value="${d}">.${d}</option>`).join('')
                : '<option value="">Tidak ada domain</option>';
            if(domains.length === 0) showToast('Admin belum menambahkan domain utama.', 'error');
        } catch (error) {
            console.error(error);
            rootDomainSelect.innerHTML = '<option value="">Error memuat</option>';
        }
    };
    
    const checkSubdomainAvailability = async () => {
        const subdomain = subdomainInput.value;
        const rootDomain = rootDomainSelect.value;
        if (!subdomain || !rootDomain) return (subdomainStatus.textContent = '');
        
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

            subdomainStatus.textContent = result.available ? 'Tersedia' : 'Sudah Digunakan';
            subdomainStatus.className = result.available ? 'available' : 'taken';
        } catch (error) {
            subdomainStatus.textContent = 'Error';
            subdomainStatus.className = 'taken';
        }
    };
    
    subdomainInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => e.target.value && checkSubdomainAvailability(), 500);
    });
    
    rootDomainSelect.addEventListener('change', checkSubdomainAvailability);
    websiteFileInput.addEventListener('change', () => fileNameSpan.textContent = websiteFileInput.files[0]?.name || 'Pilih file...');

    creatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!subdomainInput.value || !rootDomainSelect.value || !websiteFileInput.files[0] || !userApiKeyInput.value) {
            return showToast('Harap isi semua kolom!', 'error');
        }

        createBtn.disabled = true;
        createBtn.innerHTML = `<div class="spinner"></div><span id="btn-text">Memproses...</span>`;

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
            createBtn.innerHTML = `<span id="btn-text">Buat Website</span>`;
        }
    });

    modalCloseBtn.addEventListener('click', () => detailsModal.classList.remove('show'));
    detailsModal.addEventListener('click', (e) => e.target === detailsModal && detailsModal.classList.remove('show'));

    sitesList.addEventListener('click', (e) => {
        const item = e.target.closest('.sites-list-item');
        if (!item) return;
        const siteData = getSites().find(s => s.projectName === item.dataset.project);
        if (siteData) showDetailsModal(siteData);
    });

    modalCheckStatusBtn.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const { domain, project } = btn.dataset;
        
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:15px; height:15px; border-width:2px;"></div> Memeriksa...';
        
        try {
            const response = await fetch('/api/create-website', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'checkDomainStatus', data: { domain } })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            
            const updatedSite = updateSiteStatus(project, result.status);
            if (updatedSite) updateModalStatus(updatedSite.status);
            
            renderSitesList();
            showToast(result.message, result.status);
        } catch (error) {
            showToast(error.message, 'error');
            updateModalStatus('pending'); // Jika error, kembalikan ke status pending
        }
    });
    
    // --- INISIALISASI HALAMAN ---
    const initializePage = async () => {
        try {
            const savedTheme = localStorage.getItem('theme_preference_v1') || 'light';
            applyTheme(savedTheme);
            renderSitesList();
            await fetchDomains();
        } catch (error) {
            console.error("Initialization failed:", error);
            showToast("Gagal memuat data penting.", "error");
        } finally {
            // Logika untuk durasi minimal loading
            const minimumLoadingTime = 1500;
            const elapsedTime = performance.now() - startTime;
            const remainingTime = minimumLoadingTime - elapsedTime;

            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
            }, remainingTime > 0 ? remainingTime : 0);
        }
    };
    
    initializePage();
});
