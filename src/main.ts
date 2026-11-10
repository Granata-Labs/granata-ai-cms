import './style.css';
import { initAuth, setAuthChangeHandler, signInWithGoogle, logOut, getCurrentUser } from './auth';
import { loadRecipes, subscribeToReviews, setReview, clearReview, clearUrlCache, addFeedback, loadRecipeEvents, getImageUrl, getArchiveImageUrl, regenRecipeImage, regenStepImage, uploadExtraReference, listArchiveImages, assignArchiveImage } from './firestore';
import type { Recipe, RecipeReview, RecipeEvent, FilterType, ArchiveImage } from './types';
import { lightboxIsOpen, closeLightbox, stepLightbox } from './lightbox';
import type { User } from 'firebase/auth';

let recipes: Recipe[] = [];
let reviews = new Map<string, RecipeReview>();
let filteredRecipes: Recipe[] = [];
let currentFilter: FilterType = 'all';
let searchQuery = '';
let currentModalIndex = -1;
let isGenerating = false;
let imageVersions = new Map<string, number>(); // tracks image changes to bust cache

const app = document.getElementById('app')!;

setAuthChangeHandler((user: User | null) => {
    if (user) { renderApp(); loadData(); }
    else { renderLogin(); }
});
initAuth();

// Handle browser back/forward
window.addEventListener('popstate', () => {
    const id = getRecipeIdFromUrl();
    if (id && recipes.length) {
        const idx = filteredRecipes.findIndex(r => r.id === id);
        if (idx >= 0) openModal(idx);
        else { const allIdx = recipes.findIndex(r => r.id === id); if (allIdx >= 0) { currentFilter = 'all'; renderFilters(); renderGrid(); openModal(filteredRecipes.findIndex(r => r.id === id)); } }
    } else {
        closeModal();
    }
});

function getRecipeIdFromUrl(): string | null {
    const path = window.location.pathname;
    const match = path.match(/^\/recipe\/(.+)$/);
    return match ? match[1] : null;
}

function pushRecipeUrl(recipeId: string) {
    history.pushState({ recipeId }, '', `/recipe/${recipeId}`);
}

function popRecipeUrl() {
    if (window.location.pathname.startsWith('/recipe/')) {
        history.pushState({}, '', '/');
    }
}

function renderLogin() {
    app.innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
                <img src="/icon-192.png" alt="Granata AI" class="w-16 h-16 rounded-2xl mx-auto mb-4">
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
        <header class="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div class="max-w-7xl mx-auto px-4 py-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <img src="/icon-192.png" alt="" class="w-8 h-8 rounded-lg">
                        <div>
                            <h1 class="text-lg font-bold text-gray-900 leading-tight">Granata AI CMS</h1>
                            <p class="text-xs text-gray-400" id="subtitle">Loading recipes...</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <a href="https://replicate.com/account/billing" target="_blank" class="hidden sm:flex items-center gap-1 px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100">
                            <span>~$0.04/img</span>
                            <span class="text-purple-400">| Add Credits</span>
                        </a>
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
        <main class="max-w-7xl mx-auto px-4 py-4">
            <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"></div>
        </main>
        <div id="modal" class="fixed inset-0 z-50 hidden">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="modal-backdrop"></div>
            <div class="absolute inset-0 sm:inset-3 md:inset-6 lg:inset-8 bg-white sm:rounded-2xl overflow-hidden flex flex-col z-10">
                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
                    <div class="flex items-center gap-2">
                        <h2 id="modal-title" class="text-base font-bold truncate max-w-[60vw]"></h2>
                        <span id="modal-counter" class="text-xs text-gray-400 shrink-0"></span>
                    </div>
                    <button id="close-modal" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                <div class="flex-1 overflow-y-auto relative">
                    <!-- Floating nav arrows -->
                    <button id="prev-btn" class="absolute left-2 top-1/3 z-10 w-10 h-10 rounded-full bg-white/90 shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100">&larr;</button>
                    <button id="next-btn" class="absolute right-2 top-1/3 z-10 w-10 h-10 rounded-full bg-white/90 shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100">&rarr;</button>
                    <div id="modal-content" class="px-4 py-4"></div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('signout-btn')?.addEventListener('click', logOut);
    document.getElementById('export-flagged')?.addEventListener('click', exportFlagged);
    document.getElementById('export-approved')?.addEventListener('click', exportApproved);
    document.getElementById('search')?.addEventListener('input', (e) => { searchQuery = (e.target as HTMLInputElement).value.toLowerCase(); renderGrid(); });
    document.getElementById('modal-backdrop')?.addEventListener('click', closeModal);
    document.getElementById('close-modal')?.addEventListener('click', closeModal);
    // Nav arrows are inside the modal scroll area — bind via delegation
    document.getElementById('modal')?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.id === 'prev-btn' || target.closest('#prev-btn')) navigateModal(-1);
        if (target.id === 'next-btn' || target.closest('#next-btn')) navigateModal(1);
    });
    renderFilters();
}

async function loadData() {
    // Show loading skeleton immediately
    const grid = document.getElementById('grid')!;
    grid.innerHTML = Array(12).fill(0).map(() => `
        <div class="bg-white rounded-xl overflow-hidden border border-gray-200 animate-pulse">
            <div class="aspect-[3/2] bg-gray-200"></div>
            <div class="p-3 space-y-2">
                <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                <div class="h-3 bg-gray-100 rounded w-full"></div>
            </div>
        </div>
    `).join('');

    // Start loading reviews immediately (parallel with recipes)
    const reviewsReady = new Promise<void>(resolve => {
        subscribeToReviews((r) => {
            reviews = r;
            renderStats();
            if (recipes.length) renderGrid();
            // Re-render open modal so buttons update in real-time
            if (currentModalIndex >= 0 && currentModalIndex < filteredRecipes.length) {
                openModal(currentModalIndex);
            }
            resolve();
        });
    });

    // Load recipes
    recipes = await loadRecipes();
    document.getElementById('subtitle')!.textContent = `${recipes.length} recipes`;
    renderStats();
    renderGrid();

    await reviewsReady;

    // Open deep-linked recipe if URL has /recipe/{id}
    const deepLinkId = getRecipeIdFromUrl();
    if (deepLinkId) {
        const idx = filteredRecipes.findIndex(r => r.id === deepLinkId);
        if (idx >= 0) openModal(idx);
    }
}

function renderStats() {
    const total = recipes.length;
    const approved = recipes.filter(r => reviews.get(r.id)?.status === 'approved').length;
    const flagged = recipes.filter(r => reviews.get(r.id)?.status === 'flagged').length;
    document.getElementById('stats')!.innerHTML = `
        <span class="text-gray-500"><strong>${total}</strong> Total</span>
        <span class="text-green-600"><strong>${approved}</strong> Approved</span>
        <span class="text-red-600"><strong>${flagged}</strong> Flagged</span>
        <span class="text-amber-600"><strong>${total - approved - flagged}</strong> Pending</span>
    `;
}

function renderFilters() {
    const filters: { key: FilterType; label: string }[] = [
        { key: 'all', label: 'All' }, { key: 'approved', label: 'Approved' },
        { key: 'flagged', label: 'Flagged' }, { key: 'not-reviewed', label: 'Pending' },
    ];
    document.getElementById('filter-buttons')!.innerHTML = filters.map(f => `
        <button data-filter="${f.key}" class="filter-btn px-3 py-1 rounded-full text-xs font-medium ${f.key === currentFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${f.label}</button>
    `).join('');
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => { currentFilter = (btn as HTMLElement).dataset.filter as FilterType; renderFilters(); renderGrid(); });
    });
}

function matchesFilter(recipe: Recipe): boolean {
    const review = reviews.get(recipe.id);
    switch (currentFilter) {
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
    if (!filtered.length) { grid.innerHTML = '<p class="text-gray-400 col-span-full text-center py-16">No recipes match.</p>'; return; }

    grid.innerHTML = filtered.map((r, idx) => {
        const coverAsset = r.assets.find(a => a.context === 'cover');
        const review = reviews.get(r.id);
        const isApproved = review?.status === 'approved';
        const isFlagged = review?.status === 'flagged';
        const reviewer = review?.reviewedBy?.split('@')[0] || '';
        const generator = review?.generatedBy?.split('@')[0] || '';
        let badgeHtml = '';
        if (isApproved) badgeHtml = `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700" title="by ${reviewer}">APPROVED</span>`;
        else if (isFlagged) badgeHtml = `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700" title="by ${reviewer}">FLAGGED</span>`;

        return `
            <div class="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow">
                <div class="cursor-pointer recipe-card-click" data-idx="${idx}">
                    <div class="aspect-[3/2] bg-gray-100 overflow-hidden">
                        ${coverAsset ? `<img data-cover-path="${coverAsset.url}" data-version="${imageVersions.get(r.id) || 0}" alt="${r.name}" class="w-full h-full object-cover lazy-img" loading="lazy">` : '<div class="flex items-center justify-center h-full text-gray-300 text-sm">No image</div>'}
                    </div>
                    <div class="p-3 pb-1">
                        <div class="flex items-start justify-between gap-2">
                            <h3 class="font-semibold text-sm text-gray-900 leading-tight line-clamp-1">${r.name}</h3>
                            ${badgeHtml}
                        </div>
                        <p class="text-xs text-gray-500 mt-0.5 line-clamp-1">${r.description}</p>
                    </div>
                </div>
                <div class="px-3 pb-2 pt-1 flex gap-2">
                    <button class="approve-btn flex-1 py-1.5 rounded-lg text-xs font-medium ${isApproved ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}" data-id="${r.id}">
                        ${isApproved ? 'Approved' : 'Approve'}
                    </button>
                    <button class="flag-btn flex-1 py-1.5 rounded-lg text-xs font-medium ${isFlagged ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}" data-id="${r.id}">
                        ${isFlagged ? 'Flagged' : 'Flag'}
                    </button>
                </div>
                ${reviewer || generator ? `<p class="px-3 pb-2 text-[10px] text-gray-400">${reviewer ? `${review?.status} by ${reviewer}` : ''}${reviewer && generator ? ' · ' : ''}${generator ? `gen by ${generator}` : ''}</p>` : ''}
            </div>`;
    }).join('');

    // Lazy load images using IntersectionObserver — only fetch when visible
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(async (entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target as HTMLImageElement;
            const path = img.dataset.coverPath;
            if (!path) return;
            observer.unobserve(img);
            const version = parseInt(img.dataset.version || '0');
            if (version > 0) {
                // Image was updated — clear cache to get fresh URL
                const cleanPath = path.startsWith('/') ? path.substring(1) : path;
                clearUrlCache(cleanPath.split('/')[1] || '');
            }
            const url = await getImageUrl(path);
            if (url) img.src = url;
        });
    }, { rootMargin: '200px' });

    document.querySelectorAll('.lazy-img').forEach(img => observer.observe(img));
    document.querySelectorAll('.recipe-card-click').forEach(el => {
        el.addEventListener('click', () => openModal(parseInt((el as HTMLElement).dataset.idx!)));
    });
    document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); setReview((btn as HTMLElement).dataset.id!, 'approved'); });
    });
    document.querySelectorAll('.flag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const notes = prompt('Regen notes (optional):');
            if (notes === null) return;
            setReview((btn as HTMLElement).dataset.id!, 'flagged', notes);
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
    pushRecipeUrl(r.id);

    const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
    prevBtn.disabled = idx <= 0; nextBtn.disabled = idx >= filteredRecipes.length - 1;
    prevBtn.style.opacity = idx <= 0 ? '0.3' : '1';
    nextBtn.style.opacity = idx >= filteredRecipes.length - 1 ? '0.3' : '1';

    const coverAsset = r.assets.find(a => a.context === 'cover');
    const coverPath = coverAsset?.url || '';
    const prevFeedback = review?.feedback || '';
    const reviewer = review?.reviewedBy?.split('@')[0] || '';
    const generator = review?.generatedBy?.split('@')[0] || '';

    const content = document.getElementById('modal-content')!;
    content.innerHTML = `
        <div class="space-y-5 max-w-4xl mx-auto">
            <!-- Meta -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><span class="text-gray-400 text-xs">ID</span><br><code class="text-xs break-all">${r.id}</code></div>
                <div><span class="text-gray-400 text-xs">Protein</span><br><strong>${r.proteinName || 'N/A'}</strong></div>
                <div><span class="text-gray-400 text-xs">Calories</span><br><strong>${r.calories || 'N/A'}</strong></div>
                <div><span class="text-gray-400 text-xs">Status</span><br><strong>${review ? `${review.status} by ${reviewer}` : 'Not reviewed'}</strong>${generator ? `<br><span class="text-gray-400 text-[10px]">Generated by ${generator}</span>` : ''}</div>
            </div>
            <p class="text-gray-600 text-sm">${r.description}</p>

            <!-- Image Comparison -->
            <div>
                <h3 class="font-semibold text-gray-900 mb-2 text-sm">Image Comparison <span class="text-xs text-gray-400">(tap to view full size)</span></h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <p class="text-xs text-gray-400 mb-1 font-medium uppercase">Original</p>
                        <div id="original-img-container" class="aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center text-gray-300 text-sm">Loading...</div>
                        <button id="use-original-btn" class="hidden w-full mt-2 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100">Use Original</button>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1 font-medium uppercase">AI Generated</p>
                        <div id="ai-img-container" class="aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center text-gray-300 text-sm relative">Loading...</div>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
                <button id="modal-approve" class="flex-1 py-2 rounded-lg text-sm font-medium ${review?.status === 'approved' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}">
                    ${review?.status === 'approved' ? 'Approved' : 'Approve'}
                </button>
                <button id="modal-flag" class="flex-1 py-2 rounded-lg text-sm font-medium ${review?.status === 'flagged' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}">
                    ${review?.status === 'flagged' ? 'Flagged' : 'Flag'}
                </button>
                <button id="modal-clear" class="py-2 px-3 rounded-lg text-sm font-medium bg-gray-50 text-gray-500 hover:bg-gray-100">Clear</button>
            </div>

            <!-- Timeline & Feedback Thread -->
            <div class="bg-gray-50 rounded-xl p-4 space-y-3">
                <h3 class="font-semibold text-gray-900 text-sm">Activity & Feedback</h3>
                <div id="timeline" class="space-y-2 text-sm text-gray-500">Loading timeline...</div>
                <div class="border-t border-gray-200 pt-3 space-y-2">
                    <textarea id="feedback-input" placeholder="Add feedback (e.g., 'make the bun brioche', 'should be flat tostadas')" rows="2" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none">${prevFeedback}</textarea>
                    <div class="flex gap-2 items-center flex-wrap">
                        <select id="model-select" class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                            <option value="flux-3-image" selected>FLUX 3 (~$0.15)</option>
                            <option value="flux-2-pro">FLUX 2 Pro (~$0.05)</option>
                            <option value="flux-1.1-pro">FLUX 1.1 Pro (~$0.04)</option>
                            <option value="flux-schnell">FLUX Schnell (~$0.003)</option>
                        </select>
                        <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox" id="use-reference" class="rounded"> Use original as reference
                        </label>
                        <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer" title="Add extra reference images (e.g., for angle/style)">
                            <input type="file" id="extra-reference" accept="image/*" multiple class="hidden">
                            <button type="button" id="extra-ref-btn" class="px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 text-gray-600">+ Style refs</button>
                            <span id="extra-ref-name" class="text-xs text-gray-400 truncate max-w-[180px]"></span>
                        </label>
                    </div>
                    <div class="flex gap-2">
                        <button id="send-feedback-btn" class="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300">Send Feedback</button>
                        <button id="regen-btn" class="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            Regenerate (~$0.15)
                        </button>
                    </div>
                    <div id="regen-status" class="hidden text-sm text-purple-600 flex items-center gap-2">
                        <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                        Generating with Claude + FLUX... (~15 seconds)
                    </div>
                    <div id="regen-error" class="hidden text-sm text-red-600"></div>
                </div>
            </div>

            <!-- Past Generations -->
            <details id="archive-section" open>
                <summary class="font-semibold text-gray-900 text-sm cursor-pointer hover:text-gray-600">Past Generations</summary>
                <div id="archive-gallery" class="mt-3 text-sm text-gray-400">Loading archive...</div>
            </details>

            <!-- Ingredients -->
            <details open>
                <summary class="font-semibold text-gray-900 text-sm cursor-pointer hover:text-gray-600">
                    Ingredients
                    <span class="ml-2 text-xs font-normal text-gray-500">${r.ingredients.length} item${r.ingredients.length === 1 ? '' : 's'}</span>
                </summary>
                <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${r.ingredients.map(i => `
                        <div class="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-medium text-gray-800 truncate">${i.name}</div>
                                ${i.quantity ? `<div class="text-xs text-gray-500">${i.quantity}</div>` : ''}
                            </div>
                            ${i.id ? `<span class="text-[10px] text-green-600 shrink-0" title="Linked to ingredients/${i.id}">&#x1f517;</span>` : `<span class="text-[10px] text-red-500 shrink-0" title="Not linked to catalog">&#x26a0;&#xfe0f;</span>`}
                        </div>
                    `).join('')}
                </div>
            </details>

            <!-- Directions -->
            <details open>
                <summary class="font-semibold text-gray-900 text-sm cursor-pointer hover:text-gray-600">
                    Directions
                    <span class="ml-2 text-xs font-normal text-gray-500">${r.directions.length} step${r.directions.length === 1 ? '' : 's'}</span>
                    ${r.directions.some(d => d.imagePrompt) ? `<span class="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">&#x1f3a8; ${r.directions.filter(d => d.imagePrompt).length} image prompts</span>` : ''}
                </summary>
                <ol class="mt-3 space-y-3">
                    ${r.directions.map(d => `
                        <li class="bg-white border border-gray-200 rounded-lg p-3" data-step-root="${d.step}">
                            <div class="flex gap-3">
                                <span class="shrink-0 w-7 h-7 bg-gray-100 text-gray-700 rounded-full flex items-center justify-center text-xs font-semibold">${d.step}</span>
                                <div class="flex-1 min-w-0 space-y-2">
                                    <div class="text-sm text-gray-800">${d.description}</div>
                                    ${d.imagePrompt ? `
                                        <details class="" open>
                                            <summary class="text-[11px] text-blue-600 cursor-pointer hover:underline">&#x1f3a8; Image prompt</summary>
                                            <div class="mt-1 text-xs text-gray-600 bg-blue-50 rounded p-2 font-mono whitespace-pre-wrap">${d.imagePrompt}</div>
                                        </details>
                                    ` : `<div class="text-[11px] text-gray-400">No image prompt yet — will be generated on next audit</div>`}

                                    <!-- Step image + generation controls -->
                                    <div class="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 pt-1">
                                        <div id="step-${d.step}-img-container" class="aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center text-gray-300 text-xs">Loading...</div>
                                        <div class="space-y-1.5">
                                            <textarea id="step-${d.step}-feedback" placeholder="Optional feedback — see mode toggle" rows="1" class="w-full px-2 py-1.5 border border-gray-200 rounded text-xs resize-none"></textarea>
                                            <div class="flex items-center gap-1.5 text-[11px] text-gray-600">
                                                <span>Mode:</span>
                                                <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="step-${d.step}-mode" value="tweak" checked> Tweak (append)</label>
                                                <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="step-${d.step}-mode" value="overwrite"> Overwrite</label>
                                            </div>
                                            <div class="flex gap-1.5 items-center flex-wrap text-xs">
                                                <select id="step-${d.step}-model" class="px-1.5 py-1 border border-gray-200 rounded text-[11px] bg-white">
                                                    <option value="flux-2-pro">FLUX 2 Pro ($0.05)</option>
                                                    <option value="flux-1.1-pro">FLUX 1.1 Pro ($0.04)</option>
                                                    <option value="flux-schnell">FLUX Schnell ($0.003)</option>
                                                </select>
                                                <label class="flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer">
                                                    <input type="checkbox" id="step-${d.step}-use-reference" class="rounded" checked> Use original
                                                </label>
                                                <input type="file" id="step-${d.step}-extra-ref" accept="image/*" multiple class="hidden">
                                                <button type="button" data-step-extra-btn="${d.step}" class="px-1.5 py-1 rounded text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-600">+ Style refs</button>
                                                <span id="step-${d.step}-extra-name" class="text-[10px] text-gray-400 truncate max-w-[100px]"></span>
                                            </div>
                                            <button id="step-${d.step}-regen-btn" data-step-regen="${d.step}" ${d.imagePrompt ? '' : 'disabled'} class="w-full py-1.5 rounded text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                                ${d.imagePrompt ? 'Regenerate step image (~$0.05)' : 'Audit recipe first'}
                                            </button>
                                            <div id="step-${d.step}-status" class="hidden text-[11px] text-purple-600">Generating...</div>
                                            <div id="step-${d.step}-error" class="hidden text-[11px] text-red-600"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </li>
                    `).join('')}
                </ol>
            </details>
        </div>
    `;

    // Load images
    if (coverPath) {
        getImageUrl(coverPath).then(url => {
            const c = document.getElementById('ai-img-container')!;
            if (url) c.innerHTML = `<img src="${url}" class="w-full h-full object-cover cursor-zoom-in lb-img" data-full="${url}">`;
            else c.textContent = 'Not available';
        });
        const archiveCoverPath = (coverPath.startsWith('/') ? coverPath.substring(1) : coverPath).replace('/images/', '/images/_archive/');
        getArchiveImageUrl(coverPath).then(url => {
            const c = document.getElementById('original-img-container')!;
            if (url) {
                c.innerHTML = `<img src="${url}" class="w-full h-full object-cover cursor-zoom-in lb-img" data-full="${url}">`;
                // Show "Use Original" button
                const btn = document.getElementById('use-original-btn')!;
                btn.classList.remove('hidden');
                btn.addEventListener('click', async () => {
                    btn.textContent = 'Assigning...';
                    (btn as HTMLButtonElement).disabled = true;
                    try {
                        const result = await assignArchiveImage(r.id, archiveCoverPath);
                        const aiC = document.getElementById('ai-img-container');
                        if (aiC) aiC.innerHTML = `<img src="${result.downloadUrl}" class="w-full h-full object-cover cursor-zoom-in lb-img" data-full="${result.downloadUrl}">`;
                        btn.textContent = 'Original Restored';
                        imageVersions.set(r.id, (imageVersions.get(r.id) || 0) + 1);
                        renderGrid();
                        loadTimeline(r.id);
                        loadArchiveGallery(r.id);
                    } catch (err: any) {
                        btn.textContent = 'Failed';
                        alert(err.message);
                    }
                });
            } else {
                c.textContent = 'No original';
            }
        });
    } else {
        document.getElementById('ai-img-container')!.textContent = 'No image';
        document.getElementById('original-img-container')!.textContent = 'No original';
    }

    // Model select — update cost on button
    const costs: Record<string, string> = { 'flux-3-image': '$0.15', 'flux-1.1-pro': '$0.04', 'flux-2-pro': '$0.05', 'flux-schnell': '$0.003' };
    document.getElementById('model-select')?.addEventListener('change', (e) => {
        const model = (e.target as HTMLSelectElement).value;
        const btn = document.getElementById('regen-btn');
        if (btn) btn.textContent = `Regenerate (~${costs[model] || '$0.04'})`;
        // Disable reference checkbox for schnell
        const refCheckbox = document.getElementById('use-reference') as HTMLInputElement;
        if (refCheckbox) {
            refCheckbox.disabled = model === 'flux-schnell';
            if (model === 'flux-schnell') refCheckbox.checked = false;
        }
    });

    // Extra reference file picker
    document.getElementById('extra-ref-btn')?.addEventListener('click', () => {
        document.getElementById('extra-reference')?.click();
    });
    document.getElementById('extra-reference')?.addEventListener('change', (e) => {
        const files = (e.target as HTMLInputElement).files;
        const nameSpan = document.getElementById('extra-ref-name');
        if (nameSpan) {
            if (!files?.length) nameSpan.textContent = '';
            else if (files.length === 1) nameSpan.textContent = files[0].name;
            else nameSpan.textContent = `${files.length} files`;
        }
    });

    // Regen button
    document.getElementById('regen-btn')?.addEventListener('click', () => handleRegen(r.id));

    // Send feedback button
    document.getElementById('send-feedback-btn')?.addEventListener('click', async () => {
        const text = (document.getElementById('feedback-input') as HTMLTextAreaElement)?.value || '';
        if (!text.trim()) return;
        await addFeedback(r.id, text);
        (document.getElementById('feedback-input') as HTMLTextAreaElement).value = '';
        loadTimeline(r.id);
    });

    // Review buttons — only act if status is changing
    document.getElementById('modal-approve')?.addEventListener('click', () => {
        if (reviews.get(r.id)?.status === 'approved') return;
        setReview(r.id, 'approved');
    });
    document.getElementById('modal-flag')?.addEventListener('click', () => {
        if (reviews.get(r.id)?.status === 'flagged') return;
        const notes = prompt('Regen notes (optional):');
        if (notes === null) return;
        setReview(r.id, 'flagged', notes);
    });
    document.getElementById('modal-clear')?.addEventListener('click', () => clearReview(r.id));

    // Load timeline and archive gallery
    loadTimeline(r.id);
    loadArchiveGallery(r.id);

    // Wire up per-step image generation + load thumbnails
    wireStepImageHandlers(r);
}

async function wireStepImageHandlers(r: Recipe) {
    // Load each step thumbnail from main path, fallback to _archive
    for (const d of r.directions) {
        loadStepThumbnail(r.id, d.step);
    }

    // File picker buttons
    document.querySelectorAll<HTMLButtonElement>('[data-step-extra-btn]').forEach(btn => {
        const step = btn.dataset.stepExtraBtn!;
        btn.addEventListener('click', () => {
            (document.getElementById(`step-${step}-extra-ref`) as HTMLInputElement)?.click();
        });
    });
    r.directions.forEach(d => {
        const input = document.getElementById(`step-${d.step}-extra-ref`) as HTMLInputElement;
        input?.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            const nameSpan = document.getElementById(`step-${d.step}-extra-name`);
            if (nameSpan) nameSpan.textContent = !files?.length ? '' : files.length === 1 ? files[0].name : `${files.length} files`;
        });
    });

    // Regen buttons
    document.querySelectorAll<HTMLButtonElement>('[data-step-regen]').forEach(btn => {
        const step = parseInt(btn.dataset.stepRegen!, 10);
        btn.addEventListener('click', () => handleStepRegen(r.id, step));
    });
}

async function loadStepThumbnail(recipeId: string, stepNumber: number) {
    const container = document.getElementById(`step-${stepNumber}-img-container`);
    if (!container) return;
    const mainPath = `recipes/${recipeId}/images/step-${stepNumber}_${recipeId}_1.jpg`;
    const archivePath = `recipes/${recipeId}/images/_archive/step-${stepNumber}_${recipeId}_1.jpg`;
    let url = await getImageUrl(mainPath);
    let isOriginal = false;
    if (!url) {
        url = await getImageUrl(archivePath);
        isOriginal = !!url;
    }
    if (url) {
        container.innerHTML = `<img src="${url}" class="w-full h-full object-cover cursor-zoom-in lb-img" data-full="${url}">${isOriginal ? '<div class="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 bg-black/60 text-white rounded">Original</div>' : ''}`;
        container.classList.add('relative');
    } else {
        container.textContent = 'No step image';
    }
}

async function handleStepRegen(recipeId: string, stepNumber: number) {
    const btn = document.getElementById(`step-${stepNumber}-regen-btn`) as HTMLButtonElement;
    const status = document.getElementById(`step-${stepNumber}-status`)!;
    const error = document.getElementById(`step-${stepNumber}-error`)!;
    const container = document.getElementById(`step-${stepNumber}-img-container`)!;
    const feedback = (document.getElementById(`step-${stepNumber}-feedback`) as HTMLTextAreaElement)?.value || '';
    const model = (document.getElementById(`step-${stepNumber}-model`) as HTMLSelectElement)?.value || 'flux-2-pro';
    const useReference = (document.getElementById(`step-${stepNumber}-use-reference`) as HTMLInputElement)?.checked ?? true;
    const modeRadio = document.querySelector<HTMLInputElement>(`input[name="step-${stepNumber}-mode"]:checked`);
    const promptMode: 'tweak' | 'overwrite' = modeRadio?.value === 'overwrite' ? 'overwrite' : 'tweak';
    const extraFiles = (document.getElementById(`step-${stepNumber}-extra-ref`) as HTMLInputElement)?.files;

    btn.disabled = true;
    btn.textContent = 'Generating...';
    status.classList.remove('hidden');
    error.classList.add('hidden');
    container.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-100 text-purple-600 text-xs">Generating...</div>`;

    try {
        let extraReferenceUrls: string[] | undefined;
        if (extraFiles?.length && useReference) {
            extraReferenceUrls = await Promise.all(
                Array.from(extraFiles).map((file, i) => uploadExtraReference(recipeId, file, i, `step-${stepNumber}`))
            );
        }
        const result = await regenStepImage(recipeId, stepNumber, feedback || undefined, promptMode, model, useReference, extraReferenceUrls);
        container.innerHTML = `<img src="${result.downloadUrl}" class="w-full h-full object-cover cursor-zoom-in lb-img" data-full="${result.downloadUrl}">`;
        container.classList.add('relative');
        status.classList.add('hidden');
        btn.disabled = false;
        btn.textContent = 'Regenerate step image (~$0.05)';
        // Refresh timeline to show new event
        loadTimeline(recipeId);
    } catch (err: any) {
        error.textContent = err.message || 'Generation failed';
        error.classList.remove('hidden');
        status.classList.add('hidden');
        btn.disabled = false;
        btn.textContent = 'Regenerate step image (~$0.05)';
        loadStepThumbnail(recipeId, stepNumber);
    }
}

async function handleRegen(recipeId: string) {
    if (isGenerating) return;
    isGenerating = true;

    const btn = document.getElementById('regen-btn') as HTMLButtonElement;
    const status = document.getElementById('regen-status')!;
    const error = document.getElementById('regen-error')!;
    const aiContainer = document.getElementById('ai-img-container')!;
    const feedback = (document.getElementById('feedback-input') as HTMLTextAreaElement)?.value || '';
    const model = (document.getElementById('model-select') as HTMLSelectElement)?.value || 'flux-3-image';
    const useReference = (document.getElementById('use-reference') as HTMLInputElement)?.checked || false;
    const extraRefFiles = (document.getElementById('extra-reference') as HTMLInputElement)?.files;

    btn.disabled = true;
    btn.textContent = 'Generating...';
    status.classList.remove('hidden');
    error.classList.add('hidden');

    // Show loading overlay on AI image
    aiContainer.innerHTML = `
        <div class="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-purple-600">
            <svg class="animate-spin w-8 h-8 mb-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
            <span class="text-sm">Generating...</span>
        </div>`;

    try {
        // Upload extra reference images to Storage if provided
        let extraReferenceUrls: string[] | undefined;
        if (extraRefFiles?.length && useReference) {
            extraReferenceUrls = await Promise.all(
                Array.from(extraRefFiles).map((file, i) => uploadExtraReference(recipeId, file, i))
            );
        }

        const result = await regenRecipeImage(recipeId, feedback || undefined, model, useReference, extraReferenceUrls);
        repointCover(recipeId, result.coverPath);

        // Show new image and update grid
        aiContainer.innerHTML = `<img src="${result.downloadUrl}" class="w-full h-full object-cover cursor-zoom-in lb-img" data-full="${result.downloadUrl}">`;
        imageVersions.set(recipeId, (imageVersions.get(recipeId) || 0) + 1);
        renderGrid();

        // Refresh timeline and archive gallery
        loadTimeline(recipeId);
        loadArchiveGallery(recipeId);

        status.classList.add('hidden');
        btn.textContent = `Regenerate Again (~${regenCost(model)})`;
    } catch (err: any) {
        error.textContent = err.message || 'Generation failed. Check Replicate credits.';
        error.classList.remove('hidden');
        status.classList.add('hidden');
        btn.textContent = `Regenerate (~${regenCost(model)})`;

        // Restore previous image
        const r = recipes.find(r => r.id === recipeId);
        const coverPath = r?.assets.find(a => a.context === 'cover')?.url;
        if (coverPath) {
            const url = await getImageUrl(coverPath);
            if (url) aiContainer.innerHTML = `<img src="${url}" class="w-full h-full object-cover">`;
        }
    }

    btn.disabled = false;
    isGenerating = false;
}

async function loadArchiveGallery(recipeId: string) {
    const gallery = document.getElementById('archive-gallery');
    if (!gallery) return;

    try {
        const [images, events] = await Promise.all([
            listArchiveImages(recipeId),
            loadRecipeEvents(recipeId),
        ]);
        if (!images.length) {
            gallery.textContent = 'No past generations yet.';
            return;
        }

        // Match archive images to generation events by close timestamp
        const genEvents = events.filter(e => e.type === 'generated');

        gallery.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                ${images.map((img: ArchiveImage) => {
                    // Match: this archive was created when a generation started — find the gen event
                    // whose output this archive represents (the gen BEFORE the archive timestamp)
                    const archiveTs = img.timestamp.replace(/-/g, (m: string, o: number) => o > 9 ? ':' : '-');
                    const archiveTime = new Date(archiveTs).getTime();
                    const matchedEvent = genEvents.find((e, idx) => {
                        const nextGen = idx < genEvents.length - 1 ? genEvents[idx + 1] : null;
                        if (!nextGen) return false;
                        const nextGenTime = nextGen.at.getTime();
                        return Math.abs(archiveTime - nextGenTime) < 300000;
                    });
                    const modelLabel = matchedEvent?.model || '';
                    const date = img.timestamp.split('T')[0] || 'Unknown';
                    return `
                    <div class="border border-gray-200 rounded-lg overflow-hidden">
                        <img src="${img.url}" class="w-full aspect-[3/2] object-cover cursor-zoom-in lb-img" data-full="${img.url}" loading="lazy">
                        <div class="p-2">
                            <p class="text-xs text-gray-400">${date}${modelLabel ? ` · ${modelLabel}` : ''}</p>
                            <button class="assign-archive-btn w-full mt-1 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded hover:bg-blue-100" data-recipe-id="${recipeId}" data-archive-path="${img.path}">Use This</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;

        // Assign buttons
        document.querySelectorAll('.assign-archive-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const rid = (btn as HTMLElement).dataset.recipeId!;
                const path = (btn as HTMLElement).dataset.archivePath!;
                (btn as HTMLButtonElement).textContent = 'Assigning...';
                (btn as HTMLButtonElement).disabled = true;
                try {
                    const result = await assignArchiveImage(rid, path);
                    repointCover(rid, result.coverPath);
                    const aiContainer = document.getElementById('ai-img-container');
                    if (aiContainer) {
                        aiContainer.innerHTML = `<img src="${result.downloadUrl}" class="w-full h-full object-cover cursor-zoom-in lb-img" data-full="${result.downloadUrl}">`;
                    }
                    imageVersions.set(rid, (imageVersions.get(rid) || 0) + 1);
                    renderGrid();
                    (btn as HTMLButtonElement).textContent = 'Assigned!';
                } catch (err: any) {
                    (btn as HTMLButtonElement).textContent = 'Failed';
                    alert(err.message);
                }
            });
        });
    } catch {
        gallery.textContent = 'Failed to load archive.';
    }
}

async function loadTimeline(recipeId: string) {
    const timeline = document.getElementById('timeline');
    if (!timeline) return;
    try {
        const events = await loadRecipeEvents(recipeId);
        if (!events.length) {
            timeline.innerHTML = '<p class="text-gray-400 text-xs">No activity yet. Add feedback or regenerate to start.</p>';
            return;
        }
        timeline.innerHTML = events.map((e: RecipeEvent) => {
            const name = e.by.split('@')[0];
            const date = e.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const time = e.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            switch (e.type) {
                case 'generated':
                    return `<div class="flex gap-2 items-start">
                        <span class="text-purple-500 shrink-0 mt-0.5">&#x1f3a8;</span>
                        <div class="flex-1">
                            <span class="font-medium text-gray-700">${name}</span> <span class="text-gray-400">${e.stepNumber ? `Step ${e.stepNumber}: ` : ''}generated${e.model ? ` with ${e.model}` : ''}${e.usedReference ? ' + ref' : ''}</span>
                            ${e.cost ? `<span class="text-purple-400 text-xs ml-1">$${e.cost.toFixed(3)}</span>` : ''}
                            <span class="text-gray-400 text-xs ml-1">${date} ${time}</span>
                            ${e.feedback ? `<div class="text-xs text-gray-500 mt-0.5">Feedback: "${e.feedback}"</div>` : ''}
                            ${e.prompt ? `<details class="mt-1"><summary class="text-xs text-purple-500 cursor-pointer">View prompt</summary><div class="text-xs font-mono text-gray-500 mt-1 bg-white rounded p-2">${e.prompt}</div></details>` : ''}
                            ${e.imageUrl ? `<img src="${e.imageUrl}" class="mt-1 w-24 h-16 object-cover rounded cursor-zoom-in lb-img" data-full="${e.imageUrl}">` : ''}
                        </div>
                    </div>`;
                case 'feedback':
                    return `<div class="flex gap-2 items-start">
                        <span class="text-blue-500 shrink-0 mt-0.5">&#x1f4ac;</span>
                        <div>
                            <span class="font-medium text-gray-700">${name}</span>
                            <span class="text-gray-400 text-xs ml-1">${date} ${time}</span>
                            <div class="text-sm text-gray-700 mt-0.5">${e.feedback}</div>
                        </div>
                    </div>`;
                case 'approved':
                    return `<div class="flex gap-2 items-center">
                        <span class="text-green-500 shrink-0">&#x2705;</span>
                        <span class="font-medium text-gray-700">${name}</span> <span class="text-green-600">approved</span>
                        <span class="text-gray-400 text-xs ml-1">${date} ${time}</span>
                    </div>`;
                case 'flagged':
                    return `<div class="flex gap-2 items-start">
                        <span class="text-red-500 shrink-0 mt-0.5">&#x1f6a9;</span>
                        <div>
                            <span class="font-medium text-gray-700">${name}</span> <span class="text-red-600">flagged for regen</span>
                            <span class="text-gray-400 text-xs ml-1">${date} ${time}</span>
                            ${e.notes ? `<div class="text-xs text-red-500 mt-0.5">${e.notes}</div>` : ''}
                        </div>
                    </div>`;
                case 'assigned-archive':
                    return `<div class="flex gap-2 items-center">
                        <span class="text-blue-500 shrink-0">&#x1f4cb;</span>
                        <span class="font-medium text-gray-700">${name}</span> <span class="text-gray-400">assigned archived image</span>
                        <span class="text-gray-400 text-xs ml-1">${date} ${time}</span>
                    </div>`;
                case 'audited': {
                    const c = e.changes || {};
                    const ing = c.ingredients || {};
                    const dir = c.directions || {};
                    const diffRows: string[] = [];
                    const escape = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    if (c.name && c.name.before !== c.name.after) {
                        diffRows.push(`<div class="text-xs"><span class="text-gray-500">Name:</span> <span class="line-through text-red-500">${escape(c.name.before)}</span> &rarr; <span class="text-green-600">${escape(c.name.after)}</span></div>`);
                    }
                    if (c.description && c.description.before !== c.description.after) {
                        diffRows.push(`<div class="text-xs"><div class="text-gray-500">Description:</div><div class="line-through text-red-500 whitespace-pre-wrap">${escape(c.description.before)}</div><div class="text-green-600 whitespace-pre-wrap">${escape(c.description.after)}</div></div>`);
                    }
                    if (c.calories && c.calories.before !== c.calories.after) {
                        diffRows.push(`<div class="text-xs"><span class="text-gray-500">Calories:</span> <span class="line-through text-red-500">${escape(c.calories.before)}</span> &rarr; <span class="text-green-600">${escape(c.calories.after)}</span></div>`);
                    }
                    const ingParts: string[] = [];
                    if (ing.added?.length) ingParts.push(`<div class="text-xs text-green-600">+ ${ing.added.length} ingredient(s): ${ing.added.map(a => escape(a.name)).join(', ')}</div>`);
                    if (ing.removed?.length) ingParts.push(`<div class="text-xs text-red-500">&minus; ${ing.removed.length} ingredient(s): ${ing.removed.map(a => escape(a.name)).join(', ')}</div>`);
                    if (ing.changed?.length) ingParts.push(`<div class="text-xs text-orange-600">~ ${ing.changed.length} ingredient(s) changed: ${ing.changed.map(a => escape(a.name) + ' (' + escape(a.before) + ' &rarr; ' + escape(a.after) + ')').join(', ')}</div>`);
                    if (ing.linked) ingParts.push(`<div class="text-xs text-blue-600">&#x1f517; ${ing.linked} ingredient(s) linked to catalog</div>`);
                    const dirParts: string[] = [];
                    if (dir.added) dirParts.push(`+${dir.added}`);
                    if (dir.removed) dirParts.push(`-${dir.removed}`);
                    if (dir.changed) dirParts.push(`~${dir.changed}`);
                    if (dirParts.length) ingParts.push(`<div class="text-xs text-gray-600">Directions: ${dirParts.join(' ')}</div>`);
                    const sourceLabel = e.source === 'manual' ? 'manually edited' : `audited${e.model ? ` with ${e.model}` : ''}`;
                    return `<div class="flex gap-2 items-start">
                        <span class="text-orange-500 shrink-0 mt-0.5">&#x1f4dd;</span>
                        <div class="flex-1">
                            <span class="font-medium text-gray-700">${name}</span> <span class="text-gray-400">${sourceLabel}</span>
                            ${e.cost ? `<span class="text-orange-400 text-xs ml-1">$${e.cost.toFixed(3)}</span>` : ''}
                            <span class="text-gray-400 text-xs ml-1">${date} ${time}</span>
                            <details open class="mt-1">
                                <summary class="text-xs text-orange-500 cursor-pointer">View changes</summary>
                                <div class="mt-1 bg-white rounded p-2 space-y-1">
                                    ${diffRows.join('')}
                                    ${ingParts.join('')}
                                    ${e.pdfUrl ? `<div class="text-xs mt-1"><a href="${e.pdfUrl}" target="_blank" class="text-blue-600 hover:underline">View source PDF</a></div>` : ''}
                                </div>
                            </details>
                        </div>
                    </div>`;
                }
                default:
                    return '';
            }
        }).join('');
    } catch {
        timeline.innerHTML = '<p class="text-red-400 text-xs">Failed to load timeline.</p>';
    }
}

function closeModal() {
    document.getElementById('modal')!.classList.add('hidden');
    document.body.style.overflow = '';
    currentModalIndex = -1;
    popRecipeUrl();
}

function navigateModal(direction: number) {
    const newIdx = currentModalIndex + direction;
    if (newIdx >= 0 && newIdx < filteredRecipes.length) openModal(newIdx);
}

function exportFlagged() {
    const flagged = recipes.filter(r => reviews.get(r.id)?.status === 'flagged');
    if (!flagged.length) { alert('No flagged recipes'); return; }
    const text = flagged.map(r => {
        const rev = reviews.get(r.id);
        return `${r.id} | ${r.name} | flagged by ${rev?.reviewedBy?.split('@')[0] || '?'}${rev?.notes ? ' | ' + rev.notes : ''}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => alert(`Copied ${flagged.length} flagged IDs`));
}

function exportApproved() {
    const approved = recipes.filter(r => reviews.get(r.id)?.status === 'approved');
    if (!approved.length) { alert('No approved recipes'); return; }
    const text = approved.map(r => `${r.id} | ${r.name}`).join('\n');
    navigator.clipboard.writeText(text).then(() => alert(`Copied ${approved.length} approved IDs`));
}

document.addEventListener('keydown', (e) => {
    if (lightboxIsOpen()) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
        return;
    }
    if (currentModalIndex >= 0) {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'ArrowLeft') navigateModal(-1);
        if (e.key === 'ArrowRight') navigateModal(1);
    }
});

// ---------------------------------------------------------------------------
// Cover path refresh
// ---------------------------------------------------------------------------

/** A regenerate or Use This can move the cover (an app-made .webp becomes a jpg in images/). */
function repointCover(recipeId: string, coverPath: string | undefined) {
    if (!coverPath) return;
    const r = recipes.find(x => x.id === recipeId);
    if (!r) return;
    const others = r.assets.filter(a => a.context !== 'cover');
    r.assets = [...others, { type: 'image/jpeg', context: 'cover', url: coverPath } as Recipe['assets'][number]];
}

function regenCost(model: string): string {
    return ({ 'flux-3-image': '$0.15', 'flux-1.1-pro': '$0.04', 'flux-2-pro': '$0.05', 'flux-schnell': '$0.003' } as Record<string, string>)[model] || '$0.15';
}
