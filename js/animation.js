document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration (Should match Python script outputs) ---
    const baseImageDir = 'assets/images/__RGB_webp/'; // Correct path for base images
    const overlayImageDir = 'assets/images/_transparent_overlaid_tracks_only/'; // Correct path for overlays
    const imageFormat = 'webp';
    const framePadding = 6; // Number of digits for frame number (e.g., 000001)
    const maxFrame = 1000; // Restore max frame
    const minFrame = 1;
    // Decrease value for faster animation (e.g., 50ms = 20 FPS)
    const animationSpeed = 50; // Restore animation speed (ms per frame)

    // --- Get DOM Elements ---
    const imageContainer = document.getElementById('image-container'); // Get container ref
    const baseImage = document.getElementById('base-image');
    const overlayImage = document.getElementById('overlay-image');
    const trackToggle = document.getElementById('track-toggle'); // Get the toggle text element

    // --- State Variables ---
    let isPlaying = false; // Restore playing state
    let intervalId = null; // Restore interval ID
    let currentFrame = minFrame;
    let isOverlayVisible = true; // Keep overlay state separate

    // --- Function to Format Frame Number ---
    function formatFrameNumber(frame) {
        return frame.toString().padStart(framePadding, '0');
    }

    // --- Function to Update Images and Controls ---
    function updateDisplay(frame) {
        const frameStr = formatFrameNumber(frame);
        const baseImagePath = `${baseImageDir}${frameStr}.${imageFormat}`;
        const overlayImagePath = `${overlayImageDir}${frameStr}.${imageFormat}`;

        // Set base image source - diagnostics will run on load
        baseImage.src = baseImagePath;

        // Set overlay image source
        if (isOverlayVisible) {
            overlayImage.src = overlayImagePath;
        } else {
            overlayImage.src = overlayImagePath;
        }
    }

    // --- Animation Functions ---
    function playAnimation() {
        if (isPlaying) return;
        isPlaying = true;
        // No button text to update

        intervalId = setInterval(() => {
            currentFrame++;
            if (currentFrame > maxFrame) {
                currentFrame = minFrame; // Loop
            }
            updateDisplay(currentFrame);
        }, animationSpeed);
        console.log("Animation started");
    }

    function pauseAnimation() {
        if (!isPlaying) return;
        isPlaying = false;
        // No button text to update
        clearInterval(intervalId);
        intervalId = null;
        console.log("Animation paused");
    }

    // --- Event Listener for Track Toggle Text ---
    trackToggle.addEventListener('click', () => {
        isOverlayVisible = !isOverlayVisible;
        if (isOverlayVisible) {
            overlayImage.classList.remove('hidden');
            trackToggle.textContent = 'Hide Tracks';
        } else {
            overlayImage.classList.add('hidden');
            trackToggle.textContent = 'Show Tracks';
        }
    });

    // --- Event Listener for Slider Interaction ---
    // frameSlider.addEventListener('input', (event) => {
    //     pauseAnimation();
    //     currentFrame = parseInt(event.target.value, 10);
    //     updateDisplay(currentFrame);
    // });

    // --- Initial Image Load & Diagnostics ---
    // Add onload listener to the base image
    baseImage.onload = () => {
        // Start animation only AFTER the first image is loaded
        playAnimation();
    };
    baseImage.onerror = () => {
        console.error("ERROR: Base image failed to load!");
    }
    overlayImage.onerror = () => {
        console.error("ERROR: Overlay image failed to load!");
    }

    // Trigger the initial load
    updateDisplay(currentFrame);

    // Note: Animation now starts in the baseImage.onload handler

    // Update initial console message
    console.log(`Animation viewer setup initiated. Waiting for frame ${currentFrame} to load...`);
}); 