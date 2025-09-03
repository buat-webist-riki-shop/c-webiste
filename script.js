document.addEventListener('DOMContentLoaded', () => {
    // === Elemen UI ===
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
    const detailsModal = document.getElementById('details-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalVercelUrl = document.getElementById('modal-vercel-url');
    const modalCustomUrl = document.getElementById('modal-custom-url');
    const modalCheckStatusBtn = document.getElementById('modal-check-status-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const loadingOverlay = document.getElementById('loading-overlay');
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmBtnYes = document.getElementById('confirm-btn-yes');
    const confirmBtnNo = document.getElementById('confirm-btn-no');
    const showGuideLink = document.getElementById('show-guide-link');
    const guideModal = document.getElementById('guide-modal');
    const guideCloseBtn = document.getElementById('guide-close-btn');
    const discountBanner = document.getElementById('discount-banner');
    const countdownTimer = document.getElementById('countdown-timer');
    const normalPriceDisplay = document.getElementById('normal-price-display');
    const finalPriceDisplay = document.getElementById('final-price-display');
    const buyButton = document.getElementById('buy-button');
    const priceModal = document.getElementById('price-modal');
    const modalNormalPrice = document.getElementById('modal-normal-price');
    const modalFinalPrice = document.getElementById('modal-final-price');
    const modalBuyBtn = document.getElementById('modal-buy-btn');
    const modalPriceClose = document.getElementById('modal-price-close');
    const modalDnsInfo = document.getElementById('modal-dns-info');

    // === Variabel & State ===
    let toastTimeout;
    let countdownInterval;
    let settings = {};

    // === Fungsi Bantuan & UI ===
    const showToast = (message, type = 'info') => {
        const toast = document.getElementById('toast-notification');
        clearTimeout(toastTimeout);
        const iconMap = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
        toast.innerHTML = `<i class="fas ${iconMap[type]}"></i> ${message}`;
        toast.className = 'toast-notification';
        toast.classList.add(type, 'show');
        toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 4000);
    };

    const applyTheme = (theme) => {
        body.classList.toggle('dark-mode', theme === 'dark');
        themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    };

    // === Manajemen Data ===
    const getSites = () => JSON.parse(localStorage.getItem('createdSites_v1')) || [];
    const saveSite = (siteData) => {
        const sites = getSites();
        sites.unshift(siteData);
        localStorage.setItem('createdSites_v1', JSON.stringify(sites));
    };
    const removeSite = (projectName) => {
        let sites = getSites();
        sites = sites.filter(s => s.projectName !== projectName);
        localStorage.setItem('createdSites_v1', JSON.stringify(sites));
        renderSitesList();
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

    // === Fungsi Render Tampilan ===
    const renderSitesList = () => {
        const sites = getSites();
        sitesContainer.style.display = sites.length > 0 ? 'block' : 'none';
        sitesList.innerHTML = '';
        sites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'sites-list-item';
            item.innerHTML = `
                <div class="site-info">
                    <h3>${site.customUrl.replace('https://','')}</h3>
                    <span>${site.vercelUrl.replace('https://','')}</span>
                </div>
                <span class="status ${site.status}">${site.status === 'success' ? 'Aktif' : 'Menunggu'}</span>
                <button class="delete-site-btn" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--error-color); font-size:1.2em; cursor:pointer; padding: 5px;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-site-btn')) {
                    showDetailsModal(site);
                }
            });

            const deleteBtn = item.querySelector('.delete-site-btn');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirm = await showConfirmation('Hapus Riwayat?', `Anda yakin ingin menghapus riwayat untuk ${site.customUrl}? Tindakan ini tidak menghapus website.`);
                if (confirm) {
                    removeSite(site.projectName);
                    showToast('Riwayat berhasil dihapus.', 'success');
                }
            });

            sitesList.appendChild(item);
        });
    };
    
    const showConfirmation = (title, message) => {
        confirmationModal.querySelector('#confirmation-modal-title').textContent = title;
        confirmationModal.querySelector('#confirmation-modal-message').textContent = message;
        confirmationModal.classList.add('show');
        return new Promise(resolve => {
            const close = (value) => {
                confirmationModal.classList.remove('show');
                resolve(value);
            };
            confirmBtnYes.onclick = () => close(true);
            confirmBtnNo.onclick = () => close(false);
        });
    };

    const showDetailsModal = (siteData) => {
        modalVercelUrl.href = siteData.vercelUrl;
        modalVercelUrl.textContent = siteData.vercelUrl.replace('https://','');
        modalCustomUrl.href = siteData.customUrl;
        modalCustomUrl.textContent = siteData.customUrl.replace('https://','');
        modalCheckStatusBtn.dataset.project = siteData.projectName;
        modalCheckStatusBtn.dataset.domain = siteData.customUrl.replace('https://','');
        
        if (siteData.status === 'pending') {
            modalDnsInfo.style.display = 'flex';
        } else {
            modalDnsInfo.style.display = 'none';
        }

        updateModalStatus(siteData.status);
        detailsModal.classList.add('show');
    };

    const updateModalStatus = (status) => {
        modalCheckStatusBtn.disabled = false;
        modalCheckStatusBtn.innerHTML = '<i class="fas fa-sync-alt"></i> <span>Cek Status</span>';
        if (status === 'success') {
            modalCheckStatusBtn.className = 'button-primary status success';
            modalCheckStatusBtn.textContent = 'Aktif';
            modalCheckStatusBtn.disabled = true;
        } else {
            modalCheckStatusBtn.className = 'button-primary status pending';
        }
    };

    // === Logika API ===
    const fetchDomains = async () => {
        try {
            const response = await fetch('/api/create-website');
            if (!response.ok) throw new Error('Gagal memuat domain');
            const domains = await response.json();
            rootDomainSelect.innerHTML = domains.length > 0
                ? domains.map(domain => `<option value="${domain}">.${domain}</option>`).join('')
                : '<option value="">Tidak ada domain</option>';
            if (domains.length === 0) showToast('Admin belum menambahkan domain utama.', 'error');
        } catch (error) {
            rootDomainSelect.innerHTML = '<option value="">Error memuat</option>';
            throw error;
        }
    };
    
    const fetchSettings = async () => {
        try {
            const response = await fetch('/api/create-website', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'getSettings' })
            });
            if (!response.ok) throw new Error('Gagal memuat pengaturan harga.');
            settings = await response.json();
            updatePricingUI();
        } catch (error) {
            console.error(error);
            showToast(error.message, 'error');
        }
    };
    
    // === Fitur Harga & Diskon ===
    const updatePricingUI = () => {
        const normalPrice = settings.normalPrice || 0;
        const discountPrice = settings.discountPrice || 0;
        const discountEndDate = settings.discountEndDate ? new Date(settings.discountEndDate) : null;
        const now = new Date();
        const isDiscountActive = discountEndDate && discountEndDate > now;

        if (isDiscountActive) {
            discountBanner.style.display = 'block';
            normalPriceDisplay.style.display = 'block';
            normalPriceDisplay.textContent = `Rp ${normalPrice.toLocaleString('id-ID')}`;
            finalPriceDisplay.textContent = `Rp ${discountPrice.toLocaleString('id-ID')}`;
            startCountdown(discountEndDate);
        } else {
            discountBanner.style.display = 'none';
            normalPriceDisplay.style.display = 'none';
            finalPriceDisplay.textContent = `Rp ${normalPrice.toLocaleString('id-ID')}`;
            if(countdownInterval) clearInterval(countdownInterval);
        }
    };
    
    const startCountdown = (endDate) => {
        if(countdownInterval) clearInterval(countdownInterval);
        const update = () => {
            const now = new Date().getTime();
            const distance = endDate - now;
            if (distance < 0) {
                clearInterval(countdownInterval);
                updatePricingUI();
                return;
            }
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            const pad = (n) => n < 10 ? '0' + n : n;
            countdownTimer.textContent = `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        };
        update();
        countdownInterval = setInterval(update, 1000);
    };

    // === Event Listeners ===
    themeToggle.addEventListener('click', () => {
        const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem('theme_preference_v1', newTheme);
        applyTheme(newTheme);
    });

    subdomainInput.addEventListener('input', (e) => {
        const originalValue = e.target.value;
        const formattedValue = originalValue.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (originalValue !== formattedValue) e.target.value = formattedValue;
    });

    websiteFileInput.addEventListener('change', () => {
        fileNameSpan.textContent = websiteFileInput.files.length > 0 ? websiteFileInput.files[0].name : 'Pilih file...';
    });
    
    buyButton.addEventListener('click', () => {
        const normalPrice = settings.normalPrice || 0;
        const discountPrice = settings.discountPrice || 0;
        const discountEndDate = settings.discountEndDate ? new Date(settings.discountEndDate) : null;
        const isDiscountActive = discountEndDate && new Date(discountEndDate) > new Date();

        if (isDiscountActive) {
            modalNormalPrice.parentElement.style.display = 'flex';
            modalNormalPrice.textContent = `Rp ${normalPrice.toLocaleString('id-ID')}`;
            modalNormalPrice.style.textDecoration = 'line-through';
            modalNormalPrice.style.color = 'var(--text-muted)';
            
            modalFinalPrice.previousElementSibling.textContent = 'Harga Diskon';
            modalFinalPrice.textContent = `Rp ${discountPrice.toLocaleString('id-ID')}`;
        } else {
            modalNormalPrice.parentElement.style.display = 'none';
            modalFinalPrice.previousElementSibling.textContent = 'Harga';
            modalFinalPrice.textContent = `Rp ${normalPrice.toLocaleString('id-ID')}`;
        }
        
        priceModal.classList.add('show');
    });

    modalBuyBtn.addEventListener('click', () => {
        const waNumber = settings.whatsappNumber;
        if (!waNumber) return showToast('Nomor WhatsApp admin belum diatur.', 'error');
        const message = encodeURIComponent('Halo, saya tertarik untuk membeli API Key Permanen.');
        window.open(`https://wa.me/${waNumber}?text=${message}`, '_blank');
    });

    modalPriceClose.addEventListener('click', () => priceModal.classList.remove('show'));
    priceModal.addEventListener('click', (e) => { if(e.target === priceModal) priceModal.classList.remove('show'); });

    showGuideLink.addEventListener('click', (e) => {
        e.preventDefault();
        guideModal.classList.add('show');
    });

    guideCloseBtn.addEventListener('click', () => guideModal.classList.remove('show'));
    guideModal.addEventListener('click', (e) => { if(e.target === guideModal) guideModal.classList.remove('show'); });

    creatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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
            
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const textError = await response.text();
                throw new Error(textError.includes('Request Entity Too Large') ? 'File terlalu besar (maks 4.5 MB).' : 'Terjadi error di server.');
            }

            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            
            saveSite(result.siteData);
            renderSitesList();
            showDetailsModal(result.siteData);
            creatorForm.reset();
            fileNameSpan.textContent = 'Pilih file...';
            showToast('Website berhasil dibuat!', 'success');
        } catch (error) {
            showToast(`Gagal: ${error.message}`, 'error');
        } finally {
            createBtn.disabled = false;
            btnText.textContent = 'Buat Website';
            if (creatorForm.contains(spinner)) {
                 spinner.remove();
            }
        }
    });

    modalCloseBtn.addEventListener('click', () => detailsModal.classList.remove('show'));
    detailsModal.addEventListener('click', (e) => { if(e.target === detailsModal) detailsModal.classList.remove('show'); });

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
            if(result.status === 'success') {
                const updatedSite = updateSiteStatus(project, result.status);
                if(updatedSite) {
                    showDetailsModal(updatedSite); // Update modal view
                }
                renderSitesList();
            } else {
                 updateModalStatus('pending');
            }
            showToast(result.message, result.status === 'success' ? 'success' : 'info');
        } catch (error) {
            showToast(error.message, 'error');
            updateModalStatus('pending');
        } finally {
            setTimeout(() => { 
                if(btn.disabled && modalCheckStatusBtn.className.includes('pending')) {
                    updateModalStatus('pending');
                }
            }, 1000);
        }
    });

    // === Inisialisasi Halaman ===
    const initializePage = async () => {
        const savedTheme = localStorage.getItem('theme_preference_v1') || 'light';
        applyTheme(savedTheme);
        renderSitesList();

        try {
            await Promise.all([
                fetchDomains(),
                fetchSettings()
            ]);
        } catch (error) {
            console.error("Gagal inisialisasi halaman:", error);
            showToast('Gagal memuat data awal.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    };
    
    initializePage();
});