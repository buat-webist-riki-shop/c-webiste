document.addEventListener('DOMContentLoaded', () => {
    // Elemen Form
    const creatorForm = document.getElementById('creator-form');
    const subdomainInput = document.getElementById('subdomain-name');
    const rootDomainSelect = document.getElementById('root-domain-select');
    const urlPreviewText = document.getElementById('url-preview-text');
    const websiteFileInput = document.getElementById('website-file');
    const fileNameSpan = document.getElementById('file-name-span');
    const userApiKeyInput = document.getElementById('user-api-key');
    const createBtn = document.getElementById('create-btn');
    const btnText = document.getElementById('btn-text');
    const statusLog = document.getElementById('status-log');
    
    // [MODIFIKASI] Fungsi BARU: Menampilkan notifikasi toast
    let toastTimeout;
    const showToast = (message, type = 'info') => {
        const toast = document.getElementById('toast-notification');
        clearTimeout(toastTimeout);
        
        const iconMap = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
        toast.innerHTML = `<i class="fas ${iconMap[type]}"></i> ${message}`;
        toast.className = type; // Menghapus kelas lama & set baru
        
        toast.classList.add('show');
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    };

    const fetchDomains = async () => {
        try {
            const response = await fetch('/api/create-website');
            if (!response.ok) throw new Error('Gagal memuat domain');
            const domains = await response.json();

            rootDomainSelect.innerHTML = '';
            if (domains.length > 0) {
                domains.forEach(domain => {
                    const option = document.createElement('option');
                    option.value = domain;
                    option.textContent = `.${domain}`;
                    rootDomainSelect.appendChild(option);
                });
            } else {
                 rootDomainSelect.innerHTML = '<option value="">Tidak ada domain</option>';
            }
            updateUrlPreview();
        } catch (error) {
            console.error(error);
            rootDomainSelect.innerHTML = '<option value="">Error memuat</option>';
        }
    };

    const updateUrlPreview = () => {
        const subdomain = subdomainInput.value.trim() || 'website-anda';
        const rootDomain = rootDomainSelect.value;
        if(rootDomain) {
            urlPreviewText.textContent = `https://${subdomain}.${rootDomain}`;
        }
    };

    subdomainInput.addEventListener('input', updateUrlPreview);
    rootDomainSelect.addEventListener('change', updateUrlPreview);
    websiteFileInput.addEventListener('change', () => {
        fileNameSpan.textContent = websiteFileInput.files.length > 0 ? websiteFileInput.files[0].name : 'Pilih file untuk diunggah';
    });

    const logStatus = (message, type = 'info') => {
        const iconMap = { info: 'fas fa-info-circle', success: 'fas fa-check-circle', error: 'fas fa-times-circle' };
        const statusItem = document.createElement('div');
        statusItem.className = `status-item ${type}`;
        statusItem.innerHTML = `<i class="${iconMap[type]}"></i><p>${message}</p>`;
        statusLog.appendChild(statusItem);
    };

    creatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!subdomainInput.value || !rootDomainSelect.value || !websiteFileInput.files[0] || !userApiKeyInput.value) {
            // [MODIFIKASI] Menggunakan showToast, bukan alert
            showToast('Harap isi semua kolom!', 'error');
            return;
        }

        createBtn.disabled = true;
        btnText.textContent = 'Memproses...';
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        createBtn.prepend(spinner);
        statusLog.style.display = 'block';
        statusLog.innerHTML = '';

        const formData = new FormData();
        formData.append('subdomain', subdomainInput.value.trim());
        formData.append('rootDomain', rootDomainSelect.value);
        formData.append('apiKey', userApiKeyInput.value.trim());
        formData.append('websiteFile', websiteFileInput.files[0]);

        try {
            logStatus('Mengunggah file dan memulai proses...');
            const response = await fetch('/api/create-website', { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Terjadi kesalahan di server.');
            
            logStatus('Validasi berhasil...', 'success');
            logStatus('Membuat repositori GitHub...', 'success');
            logStatus('Mengunggah file ke GitHub...', 'success');
            logStatus('Mendeploy ke Vercel...', 'success');
            logStatus('Menghubungkan domain...', 'success');
            logStatus('Semua proses selesai!', 'success');

            const finalUrlDiv = document.createElement('div');
            finalUrlDiv.className = 'final-url';
            finalUrlDiv.innerHTML = `Website Anda aktif di: <a href="${result.url}" target="_blank">${result.url}</a>`;
            statusLog.appendChild(finalUrlDiv);
            showToast('Website berhasil dibuat!', 'success');

        } catch (error) {
            logStatus(`Gagal: ${error.message}`, 'error');
            showToast(error.message, 'error');
        } finally {
            createBtn.disabled = false;
            btnText.textContent = 'Buat Website Sekarang';
            spinner.remove();
        }
    });

    fetchDomains();
});