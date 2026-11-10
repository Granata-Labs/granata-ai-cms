// ---------------------------------------------------------------------------
// Image viewer: every picture in a recipe opens full screen, and you can cycle
// through them with swipe, arrows or the keyboard. Built for phones first.
// ---------------------------------------------------------------------------

let lbImages: { src: string; label: string }[] = [];
let lbIndex = 0;
let lbTouchX: number | null = null;

export function lightboxIsOpen(): boolean {
    return !!document.getElementById('lightbox') && !document.getElementById('lightbox')!.classList.contains('hidden');
}

function ensureLightbox(): HTMLElement {
    let lb = document.getElementById('lightbox');
    if (lb) return lb;
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.className = 'fixed inset-0 z-[60] hidden bg-black/95 select-none';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.innerHTML = `
        <div class="absolute inset-0 flex items-center justify-center p-2 sm:p-10" id="lb-stage">
            <img id="lb-img" alt="" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity duration-150">
        </div>
        <div class="absolute top-0 inset-x-0 flex items-center justify-between px-3 sm:px-5 pt-[max(env(safe-area-inset-top),12px)] pb-3 bg-gradient-to-b from-black/70 to-transparent text-white">
            <span id="lb-label" class="text-sm truncate pr-3"></span>
            <div class="flex items-center gap-3 shrink-0">
                <span id="lb-counter" class="text-sm text-white/70 tabular-nums"></span>
                <a id="lb-open" target="_blank" rel="noopener" class="hidden sm:inline text-xs px-2 py-1 rounded bg-white/15 hover:bg-white/25">Open original</a>
                <button id="lb-close" aria-label="Close" class="w-11 h-11 -mr-2 flex items-center justify-center text-3xl leading-none rounded-full hover:bg-white/15">&times;</button>
            </div>
        </div>
        <button id="lb-prev" aria-label="Previous picture" class="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-3xl">&#8249;</button>
        <button id="lb-next" aria-label="Next picture" class="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-3xl">&#8250;</button>
    `;
    document.body.appendChild(lb);
    lb.querySelector('#lb-close')!.addEventListener('click', closeLightbox);
    lb.querySelector('#lb-prev')!.addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(-1); });
    lb.querySelector('#lb-next')!.addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(1); });
    // Tap the dark area around the picture to close
    lb.querySelector('#lb-stage')!.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeLightbox(); });
    // Swipe left and right on a phone
    lb.addEventListener('touchstart', (e) => { lbTouchX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
        if (lbTouchX === null) return;
        const dx = e.changedTouches[0].clientX - lbTouchX;
        lbTouchX = null;
        if (Math.abs(dx) > 40) stepLightbox(dx < 0 ? 1 : -1);
    });
    return lb;
}

/** A short label for a picture, from the section it sits in. */
function pictureLabel(img: HTMLElement): string {
    if (img.closest('#original-img-container')) return 'Original';
    if (img.closest('#ai-img-container')) return 'AI generated (current cover)';
    const card = img.closest('#archive-gallery > div > div');
    if (card) return `Past generation · ${card.querySelector('p')?.textContent?.trim() || ''}`;
    const step = img.closest('[data-step-root]') as HTMLElement | null;
    if (step?.dataset.stepRoot) return `Step ${step.dataset.stepRoot}`;
    if (img.closest('#timeline')) return 'From the timeline';
    return img.getAttribute('alt') || '';
}

export function openLightbox(clicked: HTMLElement) {
    const scope = document.getElementById('modal-content') || document.body;
    const imgs = Array.from(scope.querySelectorAll<HTMLElement>('.lb-img')).filter(i => i.dataset.full);
    lbImages = imgs.map(i => ({ src: i.dataset.full!, label: pictureLabel(i) }));
    lbIndex = Math.max(0, imgs.indexOf(clicked));
    const lb = ensureLightbox();
    lb.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    showLightboxImage();
}

function showLightboxImage() {
    const item = lbImages[lbIndex];
    if (!item) return;
    const img = document.getElementById('lb-img') as HTMLImageElement;
    img.style.opacity = '0';
    img.onload = () => { img.style.opacity = '1'; };
    img.src = item.src;
    (document.getElementById('lb-open') as HTMLAnchorElement).href = item.src;
    document.getElementById('lb-label')!.textContent = item.label;
    document.getElementById('lb-counter')!.textContent = `${lbIndex + 1} / ${lbImages.length}`;
    const many = lbImages.length > 1;
    document.getElementById('lb-prev')!.classList.toggle('hidden', !many);
    document.getElementById('lb-next')!.classList.toggle('hidden', !many);
}

export function stepLightbox(dir: number) {
    if (lbImages.length < 2) return;
    lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
    showLightboxImage();
}

export function closeLightbox() {
    document.getElementById('lightbox')?.classList.add('hidden');
    document.body.style.overflow = '';
}

// One listener for every picture, including ones drawn later (gallery, steps).
document.addEventListener('click', (e) => {
    const img = (e.target as HTMLElement).closest('.lb-img') as HTMLElement | null;
    if (!img || !img.dataset.full) return;
    e.preventDefault();
    e.stopPropagation();
    openLightbox(img);
});
