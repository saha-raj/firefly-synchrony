document.addEventListener('DOMContentLoaded', () => {
    const dataUrl = 'assets/data/tracks.dat';
    const svg = d3.select("#firefly-svg-overlay");
    const backgroundImage = document.getElementById('firefly-background');
    const svgElement = document.getElementById('firefly-svg-overlay'); 
    const container = svgElement.parentElement; // Get the container (.firefly-visualization-container)
    let tracksData = []; 
    let imageWidth = 0;
    let imageHeight = 0;

    // --- 1. Load Background Image ---
    if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
        handleImageLoaded();
    } else {
        backgroundImage.onload = handleImageLoaded;
        backgroundImage.onerror = () => {
            console.error("Background image failed to load!");
            // Handle error - maybe hide visualization or show message
        };
    }

    function handleImageLoaded() {
        imageWidth = backgroundImage.naturalWidth;
        imageHeight = backgroundImage.naturalHeight;
        console.log(`Image loaded. Natural dimensions: ${imageWidth}x${imageHeight}`);

        if (!imageWidth || !imageHeight) {
            console.error("Could not get valid natural image dimensions after load.");
            return; // Stop if image dimensions are invalid
        }

        // --- 2. Size and Position SVG to Match Rendered Image ---
        sizeSvgToImage();

        // --- 3. Load and Draw Tracks ---
        loadAndDrawTracks();

        // Optional: Add a resize listener to readjust SVG if window size changes
        window.addEventListener('resize', debounce(sizeSvgToImage, 100)); 
    }

    function sizeSvgToImage() {
        // Get the rendered dimensions and position of the background image
        const imgRect = backgroundImage.getBoundingClientRect();
        // Get the position of the container (needed because SVG is absolute within it)
        const containerRect = container.getBoundingClientRect();

        // Calculate the top/left position of the SVG relative to the container
        const svgTop = imgRect.top - containerRect.top;
        const svgLeft = imgRect.left - containerRect.left;

        // Apply the dimensions and position to the SVG element via inline styles
        svgElement.style.width = `${imgRect.width}px`;
        svgElement.style.height = `${imgRect.height}px`;
        svgElement.style.top = `${svgTop}px`;
        svgElement.style.left = `${svgLeft}px`;

        // Set SVG viewBox and crucially, preserveAspectRatio='none'
        svg.attr("viewBox", `0 0 ${imageWidth} ${imageHeight}`)
           .attr("preserveAspectRatio", "none"); // Force stretch to fit element bounds

        console.log(`SVG resized/positioned. Rendered: ${imgRect.width.toFixed(1)}x${imgRect.height.toFixed(1)}, Pos: T${svgTop.toFixed(1)} L${svgLeft.toFixed(1)}, ViewBox: 0 0 ${imageWidth} ${imageHeight}, PreserveAspect: none`);
    }


    // --- 4. Load and Parse Track Data ---
    function loadAndDrawTracks() {
        // Only fetch if data hasn't been loaded yet
        if (tracksData.length > 0) {
            console.log("Track data already loaded.");
            // Optional: Redraw if needed, though usually not necessary unless data changes
            // drawTracks(); 
            // setupHoverInteraction(); // Re-setup if needed
            return;
        }
        
        console.log(`Fetching track data from: ${dataUrl}`);
        fetch(dataUrl)
            .then(response => {
                if (!response.ok) {
                    console.error(`Failed to fetch ${dataUrl}. Status: ${response.status} ${response.statusText}`);
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                parseTracks(text);
                drawTracks();
                setupHoverInteraction(); // Setup interaction after drawing
            })
            .catch(error => {
                console.error('Error loading or parsing track data:', error);
            });
    }

    function parseTracks(text) {
        // Keep parsing logic simple for now
        const lines = text.trim().split('\n');
        tracksData = lines.map((line, index) => {
            const points = [];
            const segments = line.match(/"([^"]*)"/g) || []; 
            segments.forEach(segment => {
                try {
                    const parts = segment.slice(1, -1).split(',');
                    if (parts.length >= 2) {
                        const x = parseFloat(parts[0]);
                        const y = parseFloat(parts[1]);
                        if (!isNaN(x) && !isNaN(y)) {
                            points.push([x, y]);
                        }
                    }
                } catch (e) { /* Handle silently or log warning */ }
            });
            return points.length >= 2 ? { id: index, points: points, element: null } : null; 
        }).filter(track => track !== null); 
        console.log(`Parsed ${tracksData.length} valid tracks.`);
    }

    // --- 5. Draw Tracks as SVG Polylines ---
    function drawTracks() {
        svg.selectAll(".firefly-track").remove(); // Clear previous tracks if redrawing

        if (tracksData.length === 0) return; 

        tracksData.forEach(track => {
            const validPoints = track.points.filter(p => !isNaN(p[0]) && !isNaN(p[1]));
            if (validPoints.length >= 2) {
                 const polyline = svg.append("polyline")
                    .attr("class", "firefly-track")
                    .attr("points", validPoints.map(p => p.join(",")).join(" "))
                    .datum(track); 
                 track.element = polyline.node(); 
            }
        });
        console.log("Finished drawing tracks.");
    }

    // --- 6. Setup Hover Interaction ---
    function setupHoverInteraction() {
        // Remove previous listeners if re-setting up
        svgElement.removeEventListener('mousemove', handleMouseMove);
        svgElement.removeEventListener('mouseleave', handleMouseLeave);

        if (tracksData.length === 0) return; 

        let highlightedTrack = null;

        // Define handlers separately for clarity and removal
        function handleMouseMove(event) {
            const svgRect = svgElement.getBoundingClientRect();
            const mouseClientX = event.clientX;
            const mouseClientY = event.clientY;

            const svgPoint = svgElement.createSVGPoint();
            svgPoint.x = mouseClientX;
            svgPoint.y = mouseClientY;

            try {
                 // Check if CTM is invertible before transforming
                 const inverseCTM = svgElement.getScreenCTM().inverse();
                 if (!inverseCTM) {
                     console.warn("SVG Screen CTM is not invertible.");
                     return; 
                 }
                 const pointTransformed = svgPoint.matrixTransform(inverseCTM);
                 const mouseX = pointTransformed.x;
                 const mouseY = pointTransformed.y;

                 let closestTrack = null;
                 let minDistanceSq = Infinity;

                 tracksData.forEach(track => {
                     if (!track.element) return; 
                     track.points.forEach(point => {
                         if (!isNaN(point[0]) && !isNaN(point[1])) {
                             const dx = point[0] - mouseX;
                             const dy = point[1] - mouseY;
                             const distSq = dx * dx + dy * dy;
                             if (distSq < minDistanceSq) {
                                 minDistanceSq = distSq;
                                 closestTrack = track;
                             }
                         }
                     });
                 });

                 const highlightThresholdSq = 100; 

                 if (closestTrack && minDistanceSq < highlightThresholdSq) {
                     if (closestTrack !== highlightedTrack) {
                         if (highlightedTrack && highlightedTrack.element) {
                             d3.select(highlightedTrack.element).classed('highlighted', false);
                         }
                         d3.select(closestTrack.element).classed('highlighted', true);
                         highlightedTrack = closestTrack;
                     }
                 } else {
                     if (highlightedTrack && highlightedTrack.element) {
                         d3.select(highlightedTrack.element).classed('highlighted', false);
                     }
                     highlightedTrack = null;
                 }
            } catch (error) {
                 console.error("Error during mousemove coordinate transformation:", error);
            }
        }

        function handleMouseLeave() {
            if (highlightedTrack && highlightedTrack.element) {
                d3.select(highlightedTrack.element).classed('highlighted', false);
            }
            highlightedTrack = null;
        }

        // Add the event listeners
        svgElement.addEventListener('mousemove', handleMouseMove);
        svgElement.addEventListener('mouseleave', handleMouseLeave);
        console.log("Hover interaction setup complete.");
    }

    // --- Utility: Debounce ---
    // Simple debounce function to limit resize handler frequency
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

}); 