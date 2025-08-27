document.addEventListener('DOMContentLoaded', () => {
    // Elemen UI
    const loadingOverlay = document.getElementById('loading-overlay');
    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('login-btn');
    const createKeyForm = document.getElementById('create-key-form');
    const keyListContainer = document.getElementById('api-key-list-container');
    const permanentCheckbox = document.getElementById('permanent-key');
    const durationSection = document.getElementById('duration-section');
    
    // Elemen Tema
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    // --- LOGIKA TEMA TERANG/GELAP ---
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

    // --- LOGIKA UTAMA ---
    const callApi = async (action, data = {}) => {
        const password = sessionStorage.getItem('adminPassword');
        if (!password) {
            alert('Sesi admin tidak ditemukan. Harap login ulang.');
            throw new Error('Sesi admin tidak valid');
        }
        
        const response = await fetch('/api/create-website', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, data, adminPassword: password })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        return result;
    };

    const loadApiKeys = async () => {
        keyListContainer.innerHTML = '<p>Memuat kunci...</p>';
        try {
            const keys = await callApi('getApiKeys');
            keyListContainer.innerHTML = '';
            if (Object.keys(keys).length === 0) {
                keyListContainer.innerHTML = '<p>Belum ada API Key yang dibuat.</p>';
                return;
            }
            for (const key in keys) {
                const keyData = keys[key];
                const expiry = keyData.expires_at === 'permanent' ? 'Permanen' 
                    : `Kadaluwarsa: ${new Date(keyData.expires_at).toLocaleDateString('id-ID')}`;
                
                const item = document.createElement('div');
                item.className = 'key-item';
                item.innerHTML = `
                    <div class="key-info">
                        <span class="key-name">${key}</span>
                        <span class="key-expiry">${expiry}</span>
                    </div>
                    <button class="delete-btn" data-key="${key}"><i class="fas fa-trash-alt"></i></button>
                `;
                keyListContainer.appendChild(item);
            }
        } catch (error) {
            keyListContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    };

    loginBtn.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (!password) return alert('Password tidak boleh kosong.');
        sessionStorage.setItem('adminPassword', password);
        
        try {
            loginBtn.textContent = 'Memverifikasi...';
            loginBtn.disabled = true;
            await callApi('getApiKeys');
            loginScreen.style.display = 'none';
            adminPanel.style.display = 'block';
            loadApiKeys();
        } catch (error) {
            alert(`Login Gagal: ${error.message}`);
            sessionStorage.removeItem('adminPassword');
        } finally {
            loginBtn.textContent = 'Masuk';
            loginBtn.disabled = false;
        }
    });

    createKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const keyNameInput = document.getElementById('new-apikey-name');
        const data = {
            key: keyNameInput.value.trim(),
            duration: document.getElementById('new-apikey-duration').value,
            unit: document.getElementById('new-apikey-unit').value,
            isPermanent: permanentCheckbox.checked
        };
        try {
            const result = await callApi('createApiKey', data);
            alert(`Sukses: ${result.message}`);
            keyNameInput.value = '';
            loadApiKeys();
        } catch (error) {
            alert(`Gagal: ${error.message}`);
        }
    });
    
    keyListContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('.delete-btn');
        if (button) {
            const key = button.dataset.key;
            if (confirm(`Yakin ingin menghapus kunci "${key}"?`)) {
                try {
                    const result = await callApi('deleteApiKey', { key });
                    alert(`Sukses: ${result.message}`);
                    loadApiKeys();
                } catch (error) {
                    alert(`Gagal: ${error.message}`);
                }
            }
        }
    });

    permanentCheckbox.addEventListener('change', () => {
        durationSection.style.display = permanentCheckbox.checked ? 'none' : 'block';
    });

    // --- INISIALISASI ---
    const init = () => {
        const savedTheme = localStorage.getItem('theme_preference_v1') || 'light';
        applyTheme(savedTheme);

        // Tampilkan login screen setelah 500ms agar animasi loading terlihat
        setTimeout(() => {
            if (sessionStorage.getItem('adminPassword')) {
                loginBtn.click(); // Coba login otomatis jika ada sesi
            } else {
                loginScreen.style.display = 'block';
            }
            loadingOverlay.classList.add('hidden');
        }, 500);
    };
    
    init();
});