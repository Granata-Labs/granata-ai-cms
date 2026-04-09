import './style.css';
import { initAuth, setAuthChangeHandler, signInWithGoogle, logOut, getCurrentUser } from './auth';
import { loadRecipes, subscribeToReviews, setReview, clearReview, getImageUrl, getArchiveImageUrl } from './firestore';
import type { Recipe, RecipeReview, FilterType } from './types';
import type { User } from 'firebase/auth';

let recipes: Recipe[] = [];
let reviews = new Map<string, RecipeReview>();
let filteredRecipes: Recipe[] = [];
let currentFilter: FilterType = 'all';
let searchQuery = '';
let currentModalIndex = -1;

const app = document.getElementById('app')!;

// Auth change handler
setAuthChangeHandler((user: User | null) => {
    if (user) {
        renderApp();
        loadData();
    } else {
        renderLogin();
    }
});

initAuth();

function renderLogin() {
    app.innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
                <div class="text-4xl mb-4">🍽</div>
                <h1 class="text-2xl font-bold text-gray-900 mb-2">Granata AI CMS</h1>
                <p class="text-gray-500 text-sm mb-6">Recipe image review & management</p>
                <button id="google-signin" class="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all font-medium text-gray-700">
                    <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Sign in with Google
                </button>
                <p class="text-xs text-gray-400 mt-4">Restricted to @granatalabs.com accounts</p>
            </div>
        </div>
    `;
    document.getElementById('google-signin')?.addEventListener('click', signInWithGoogle);
}

function renderApp() {
    const user = getCurrentUser()!;
    app.innerHTML = `
        <!-- Header -->
        <header class="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div class="max-w-7xl mx-auto px-4 py-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <span class="text-xl">🍽</span>
                        <div>
                            <h1 class="text-lg font-bold text-gray-900 leading-tight">Granata AI CMS</h1>
                            <p class="text-xs text-gray-400" id="subtitle">Loading recipes...</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="hidden sm:flex gap-1">
                            <button id="export-flagged" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100">Export Flagged</button>
                            <button id="export-approved" class="px-2 py-1 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100">Export Approved</button>
                        </div>
                        <div class="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
                            <img src="${user.photoURL}" alt="" class="w-7 h-7 rounded-full">
                            <button id="signout-btn" class="text-xs text-gray-400 hover:text-gray-600">Sign out</button>
                        </div>
                    </div>
                </div>
                <div class="flex gap-3 mt-2 text-xs" id="stats"></div>
                <div class="flex gap-2 mt-2 flex-wrap items-center">
                    <div class="flex gap-1 flex-wrap" id="filter-buttons"></div>
                    <div class="flex-1"></div>
                    <input type="text" id="search" placeholder="Search..." class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-40 sm:w-56">
                </div>
            </div>
        </header>
        <!-- Grid -->
        <main class="max-w-7xl mx-auto px-4 py-4">
            <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"></div>
        </main>
        <!-- Modal -->
        <div id="modal" class="fixed inset-0 z-50 hidden">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="modal-backdrop"></div>
            <div class="absolute inset-0 sm:inset-3 md:inset-6 lg:inset-8 bg-white sm:rounded-2xl overflow-hidden flex flex-col z-10">
                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
                    <div class="flex items-center gap-2">
                        <button id="prev-btn" class="px-2 py-1 rounded-lg text-xs bg-gray-100 hover:bg-gray-200">&larr;</button>
                        <h2 id="modal-title" class="text-base font-bold truncate max-w-[50vw]"></h2>
                        <span id="modal-counter" class="text-xs text-gray-400 shrink-0"></span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="next-btn" class="px-2 py-1 rounded-lg text-xs bg-gray-100 hover:bg-gray-200">&rarr;</button>
                        <button id="close-modal" class="text-gray-400 hover:text-gray-600 text-xl ml-1">&times;</button>
                    </div>
                </div>
                <div id="modal-content" class="flex-1 overflow-y-auto px-4 py-4"></div>
            </div>
        </div>
    `;

    // Event listeners
    document.getElementById('signout-btn')?.addEventListener('click', logOut);
    document.getElementById('export-flagged')?.addEventListener('click', exportFlagged);
    document.getElementById('export-approved')?.addEventListener('click', exportApproved);
    document.getElementById('search')?.addEventListener('input', (e) => {
        searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
        renderGrid();
    });
    document.getElementById('modal-backdrop')?.addEventListener('click', closeModal);
    document.getElementById('close-modal')?.addEventListener('click', closeModal);
    document.getElementById('prev-btn')?.addEventListener('click', () => navigateModal(-1));
    document.getElementById('next-btn')?.addEventListener('click', () => navigateModal(1));

    renderFilters();
}

async function loadData() {
    recipes = await loadRecipes();
    document.getElementById('subtitle')!.textContent = `${recipes.length} recipes`;
    subscribeToReviews((r) => {
        reviews = r;
        renderStats();
        renderGrid();
    });
    renderStats();
    renderGrid();
}

function renderStats() {
    const total = recipes.length;
    const approved = recipes.filter(r => reviews.get(r.id)?.status === 'approved').length;
    const flagged = recipes.filter(r => reviews.get(r.id)?.status === 'flagged').length;
    const notReviewed = total - approved - flagged;

    document.getElementById('stats')!.innerHTML = `
        <span class="text-gray-500"><strong>${total}</strong> Total</span>
        <span class="text-green-600"><strong>${approved}</strong> Approved</span>
        <span class="text-red-600"><strong>${flagged}</strong> Flagged</span>
        <span class="text-amber-600"><strong>${notReviewed}</strong> Pending</span>
    `;
}

function renderFilters() {
    const filters: { key: FilterType; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'approved', label: 'Approved' },
        { key: 'flagged', label: 'Flagged' },
        { key: 'not-reviewed', label: 'Pending' },
    ];
    document.getElementById('filter-buttons')!.innerHTML = filters.map(f => `
        <button data-filter="${f.key}" class="filter-btn px-3 py-1 rounded-full text-xs font-medium ${f.key === currentFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${f.label}</button>
    `).join('');
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = (btn as HTMLElement).dataset.filter as FilterType;
            renderFilters();
            renderGrid();
        });
    });
}

function matchesFilter(recipe: Recipe): boolean {
    const review = reviews.get(recipe.id);
    switch (currentFilter) {
        case 'all': return true;
        case 'approved': return review?.status === 'approved';
        case 'flagged': return review?.status === 'flagged';
        case 'not-reviewed': return !review;
        default: return true;
    }
}

function renderGrid() {
    const filtered = recipes.filter(r => matchesFilter(r) && r.name.toLowerCase().includes(searchQuery));
    filteredRecipes = filtered;
    const grid = document.getElementById('grid')!;

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="text-gray-400 col-span-full text-center py-16">No recipes match this filter.</p>';
        return;
    }

    grid.innerHTML = filtered.map((r, idx) => {
        const review = reviews.get(r.id);
        const coverAsset = r.assets.find(a => a.context === 'cover');
        const isApproved = review?.status === 'approved';
        const isFlagged = review?.status === 'flagged';

        let badgeHtml = '';
        if (isApproved) badgeHtml = '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">APPROVED</span>';
        else if (isFlagged) badgeHtml = '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">FLAGGED</span>';

        return `
            <div class="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow" data-idx="${idx}">
                <div class="cursor-pointer recipe-card-click" data-idx="${idx}">
                    <div class="aspect-[3/2] bg-gray-100 overflow-hidden">
                        ${coverAsset ? `<img data-cover-path="${coverAsset.url}" alt="${r.name}" class="w-full h-full object-cover lazy-img" loading="lazy">` : '<div class="flex items-center justify-center h-full text-gray-300 text-sm">No image</div>'}
                    </div>
                    <div class="p-3 pb-1">
                        <div class="flex items-start justify-between gap-2">
                            <h3 class="font-semibold text-sm text-gray-900 leading-tight line-clamp-1">${r.name}</h3>
                            ${badgeHtml}
                        </div>
                        <p class="text-xs text-gray-500 mt-0.5 line-clamp-1">${r.description}</p>
                    </div>
                </div>
                <div class="px-3 pb-3 pt-1 flex gap-2">
                    <button class="approve-btn flex-1 py-1.5 rounded-lg text-xs font-medium ${isApproved ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}" data-id="${r.id}">
                        ${isApproved ? 'Approved' : 'Approve'}
                    </button>
                    <button class="flag-btn flex-1 py-1.5 rounded-lg text-xs font-medium ${isFlagged ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}" data-id="${r.id}">
                        ${isFlagged ? 'Flagged' : 'Flag'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Load images lazily via Storage SDK
    document.querySelectorAll('.lazy-img').forEach(async (img) => {
        const path = (img as HTMLElement).dataset.coverPath;
        if (path) {
            const url = await getImageUrl(path);
            if (url) (img as HTMLImageElement).src = url;
        }
    });

    // Card click → open modal
    document.querySelectorAll('.recipe-card-click').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt((el as HTMLElement).dataset.idx!);
            openModal(idx);
        });
    });

    // Approve/Flag buttons on cards
    document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setReview((btn as HTMLElement).dataset.id!, 'approved');
        });
    });
    document.querySelectorAll('.flag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = (btn as HTMLElement).dataset.id!;
            const notes = prompt('Regen notes (optional):');
            if (notes === null) return;
            setReview(id, 'flagged', notes);
        });
    });
}

async function openModal(idx: number) {
    if (idx < 0 || idx >= filteredRecipes.length) return;
    currentModalIndex = idx;
    const r = filteredRecipes[idx];
    const review = reviews.get(r.id);

    document.getElementById('modal')!.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('modal-title')!.textContent = r.name;
    document.getElementById('modal-counter')!.textContent = `${idx + 1} of ${filteredRecipes.length}`;

    const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= filteredRecipes.length - 1;
    prevBtn.style.opacity = idx <= 0 ? '0.3' : '1';
    nextBtn.style.opacity = idx >= filteredRecipes.length - 1 ? '0.3' : '1';

    const coverAsset = r.assets.find(a => a.context === 'cover');
    const coverPath = coverAsset?.url || '';

    const content = document.getElementById('modal-content')!;
    content.innerHTML = `
        <div class="space-y-5 max-w-4xl mx-auto">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><span class="text-gray-400 text-xs">ID</span><br><code class="text-xs break-all">${r.id}</code></div>
                <div><span class="text-gray-400 text-xs">Protein</span><br><strong>${r.proteinName || 'N/A'}</strong></div>
                <div><span class="text-gray-400 text-xs">Calories</span><br><strong>${r.calories || 'N/A'}</strong></div>
                <div><span class="text-gray-400 text-xs">Review</span><br><strong>${review ? review.status + ' by ' + review.reviewedBy?.split('@')[0] : 'Not reviewed'}</strong></div>
            </div>
            <p class="text-gray-600 text-sm">${r.description}</p>

            <!-- Image Comparison -->
            <div>
                <h3 class="font-semibold text-gray-900 mb-2 text-sm">Image Comparison <span class="text-xs text-gray-400">(tap to view full size)</span></h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <p class="text-xs text-gray-400 mb-1 font-medium uppercase">Original</p>
                        <div id="original-img-container" class="aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center text-gray-300 text-sm">Loading...</div>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1 font-medium uppercase">AI Generated</p>
                        <div id="ai-img-container" class="aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center text-gray-300 text-sm">Loading...</div>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
                <button id="modal-approve" class="flex-1 py-2 rounded-lg text-sm font-medium ${review?.status === 'approved' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}">
                    ${review?.status === 'approved' ? 'Approved' : 'Approve'}
                </button>
                <button id="modal-flag" class="flex-1 py-2 rounded-lg text-sm font-medium ${review?.status === 'flagged' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}">
                    ${review?.status === 'flagged' ? 'Flagged' : 'Flag for Regen'}
                </button>
                <button id="modal-clear" class="py-2 px-3 rounded-lg text-sm font-medium bg-gray-50 text-gray-500 hover:bg-gray-100">Clear</button>
            </div>

            ${review?.status === 'flagged' && review.notes ? `<div class="bg-red-50 rounded-lg p-3 text-sm text-red-700"><strong>Notes:</strong> ${review.notes}</div>` : ''}

            <!-- Ingredients -->
            <details>
                <summary class="font-semibold text-gray-900 text-sm cursor-pointer hover:text-gray-600">Ingredients (${r.ingredients.length})</summary>
                <ul class="mt-2 space-y-1 ml-4 list-disc">
                    ${r.ingredients.map(i => `<li class="text-sm text-gray-700">${i.name}${i.quantity ? ` <span class="text-gray-400">(${i.quantity})</span>` : ''}</li>`).join('')}
                </ul>
            </details>

            <!-- Directions -->
            <details>
                <summary class="font-semibold text-gray-900 text-sm cursor-pointer hover:text-gray-600">Directions (${r.directions.length} steps)</summary>
                <ol class="mt-2 ml-4 list-decimal space-y-2">
                    ${r.directions.map(d => `<li class="text-sm text-gray-700">Step ${d.step}: ${d.description}</li>`).join('')}
                </ol>
            </details>
        </div>
    `;

    // Load images
    if (coverPath) {
        getImageUrl(coverPath).then(url => {
            const container = document.getElementById('ai-img-container')!;
            if (url) container.innerHTML = `<img src="${url}" class="w-full h-full object-cover cursor-pointer" onclick="window.open('${url}', '_blank')">`;
            else container.textContent = 'Not available';
        });
        getArchiveImageUrl(coverPath).then(url => {
            const container = document.getElementById('original-img-container')!;
            if (url) container.innerHTML = `<img src="${url}" class="w-full h-full object-cover cursor-pointer" onclick="window.open('${url}', '_blank')">`;
            else container.textContent = 'No original';
        });
    } else {
        document.getElementById('ai-img-container')!.textContent = 'No image';
        document.getElementById('original-img-container')!.textContent = 'No original';
    }

    // Modal button handlers
    document.getElementById('modal-approve')?.addEventListener('click', () => {
        setReview(r.id, 'approved');
    });
    document.getElementById('modal-flag')?.addEventListener('click', () => {
        const notes = prompt('Regen notes (optional):');
        if (notes === null) return;
        setReview(r.id, 'flagged', notes);
    });
    document.getElementById('modal-clear')?.addEventListener('click', () => {
        clearReview(r.id);
    });
}

function closeModal() {
    document.getElementById('modal')!.classList.add('hidden');
    document.body.style.overflow = '';
    currentModalIndex = -1;
}

function navigateModal(direction: number) {
    const newIdx = currentModalIndex + direction;
    if (newIdx >= 0 && newIdx < filteredRecipes.length) {
        openModal(newIdx);
    }
}

function exportFlagged() {
    const flagged = recipes.filter(r => reviews.get(r.id)?.status === 'flagged');
    if (!flagged.length) { alert('No flagged recipes'); return; }
    const text = flagged.map(r => {
        const notes = reviews.get(r.id)?.notes || '';
        return `${r.id} | ${r.name}${notes ? ' | ' + notes : ''}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => alert(`Copied ${flagged.length} flagged IDs`));
}

function exportApproved() {
    const approved = recipes.filter(r => reviews.get(r.id)?.status === 'approved');
    if (!approved.length) { alert('No approved recipes'); return; }
    const text = approved.map(r => `${r.id} | ${r.name}`).join('\n');
    navigator.clipboard.writeText(text).then(() => alert(`Copied ${approved.length} approved IDs`));
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (currentModalIndex >= 0) {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'ArrowLeft') navigateModal(-1);
        if (e.key === 'ArrowRight') navigateModal(1);
    }
});
