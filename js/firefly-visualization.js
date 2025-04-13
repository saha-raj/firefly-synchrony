document.addEventListener('DOMContentLoaded', () => {
    const dataUrl = 'assets/data/tracks.dat';
    const svg = d3.select("#firefly-svg-overlay");
    const backgroundImage = document.getElementById('firefly-background');
    const svgElement = document.getElementById('firefly-svg-overlay');
    const container = svgElement.parentElement;
    let tracksData = []; // Structure: [{ id, points: [{x, y, intensity, frame}], element }, ...]
    let imageWidth = 0;
    let imageHeight = 0;
    let activePopup = null; // Reference to the currently visible popup div

    // --- 1. Load Background Image ---
    if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
        handleImageLoaded();
    } else {
        backgroundImage.onload = handleImageLoaded;
        backgroundImage.onerror = () => console.error("Background image failed to load!");
    }

    function handleImageLoaded() {
        imageWidth = backgroundImage.naturalWidth;
        imageHeight = backgroundImage.naturalHeight;
        if (!imageWidth || !imageHeight) {
            console.error("Could not get valid natural image dimensions.");
            return;
        }
        sizeSvgToImage();
        loadAndDrawTracks();
        window.addEventListener('resize', debounce(sizeSvgToImage, 100));
    }

    function sizeSvgToImage() {
        const imgRect = backgroundImage.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const svgTop = imgRect.top - containerRect.top;
        const svgLeft = imgRect.left - containerRect.left;

        svgElement.style.width = `${imgRect.width}px`;
        svgElement.style.height = `${imgRect.height}px`;
        svgElement.style.top = `${svgTop}px`;
        svgElement.style.left = `${svgLeft}px`;

        svg.attr("viewBox", `0 0 ${imageWidth} ${imageHeight}`)
           .attr("preserveAspectRatio", "none");
        console.log(`SVG resized/positioned. Rendered: ${imgRect.width.toFixed(1)}x${imgRect.height.toFixed(1)}`);

        // If a popup exists, resize and reposition it
        if (activePopup && activePopup.trackData) {
            // Recalculate size based on new SVG height
            const svgRect = svgElement.getBoundingClientRect();
            const newSize = Math.max(50, Math.floor(svgRect.height / 3)); // Ensure minimum size
            activePopup.style.width = `${newSize}px`;
            activePopup.style.height = `${newSize}px`;

            // Redraw chart with new dimensions (optional, could just scale SVG)
            // For simplicity, let's assume CSS scaling handles the SVG content resize
            // If chart elements look bad, uncomment and adapt drawIntensityChart
            // drawIntensityChart(activePopup, activePopup.trackData, newSize, newSize);

            // Reposition based on original click and new size/bounds
            positionPopup(activePopup, activePopup.clickEvent, newSize, newSize);
        }
    }

    // --- 4. Load and Parse Track Data ---
    function loadAndDrawTracks() {
        if (tracksData.length > 0) return; // Already loaded

        fetch(dataUrl)
            .then(response => response.ok ? response.text() : Promise.reject(`HTTP error! status: ${response.status}`))
            .then(text => {
                parseTracks(text); // Updated parsing
                drawTracks();
                setupInteractions(); // Handles hover and click
            })
            .catch(error => console.error('Error loading or parsing track data:', error));
    }

    function parseTracks(text) {
        const lines = text.trim().split('\n');
        tracksData = lines.map((line, index) => {
            const pointsData = []; // Store {x, y, intensity, frame}
            const segments = line.match(/"([^"]*)"/g) || [];
            segments.forEach(segment => {
                try {
                    const parts = segment.slice(1, -1).split(',');
                    // Expecting: X_coord, Y_coord, Area, Intensity, Frame_Index
                    if (parts.length >= 5) {
                        const x = parseFloat(parts[0]);
                        const y = parseFloat(parts[1]);
                        // const area = parseFloat(parts[2]); // Area not used yet
                        const intensity = parseFloat(parts[3]);
                        const frame = parseInt(parts[4], 10);
                        if (!isNaN(x) && !isNaN(y) && !isNaN(intensity) && !isNaN(frame)) {
                            pointsData.push({ x, y, intensity, frame });
                        }
                    }
                } catch (e) { /* Handle silently or log warning */ }
            });
            // Sort points by frame index for the chart
            pointsData.sort((a, b) => a.frame - b.frame);
            // Only include tracks with enough data points for a line
            return pointsData.length >= 2 ? { id: index, points: pointsData, element: null } : null;
        }).filter(track => track !== null);
        console.log(`Parsed ${tracksData.length} valid tracks with intensity/frame data.`);
    }

    // --- 5. Draw Tracks as SVG Polylines ---
    function drawTracks() {
        svg.selectAll(".firefly-track").remove();
        if (tracksData.length === 0) return;

        tracksData.forEach(track => {
            // Use only x, y for the polyline points attribute
            const polylinePoints = track.points.map(p => `${p.x},${p.y}`).join(" ");
            if (polylinePoints) {
                 const polyline = svg.append("polyline")
                    .attr("class", "firefly-track")
                    .attr("points", polylinePoints)
                    .datum(track); // Attach full track data {id, points: [{x,y,intensity,frame}]}
                 track.element = polyline.node();
            }
        });
        console.log("Finished drawing tracks.");
    }

    // --- 6. Setup Hover and Click Interactions ---
    function setupInteractions() {
        svgElement.removeEventListener('mousemove', handleMouseMove);
        svgElement.removeEventListener('mouseleave', handleMouseLeave);
        svgElement.removeEventListener('click', handleMouseClick); // Add click listener

        if (tracksData.length === 0) return;

        let highlightedTrack = null;

        function handleMouseMove(event) {
            // --- Find closest track (similar logic as before) ---
            const { closestTrack, minDistanceSq } = findClosestTrack(event);
            const highlightThresholdSq = 100;

            // --- Update highlighting ---
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
        }

        function handleMouseLeave() {
            if (highlightedTrack && highlightedTrack.element) {
                d3.select(highlightedTrack.element).classed('highlighted', false);
            }
            highlightedTrack = null;
        }

        function handleMouseClick(event) {
            // Check if the click was on an existing popup - if so, do nothing
            if (event.target.closest('.intensity-chart-popup')) {
                return;
            }

            const { closestTrack, minDistanceSq } = findClosestTrack(event);
            const clickThresholdSq = 100;

            // If clicking the *same* track that's already showing a popup, do nothing
            if (activePopup && activePopup.trackData && closestTrack && activePopup.trackData.id === closestTrack.id) {
                 return;
            }

            // Remove any existing popup *before* creating a new one
            removePopup();

            if (closestTrack && minDistanceSq < clickThresholdSq) {
                console.log(`Clicked track ID: ${closestTrack.id}`);
                // Pass the event that triggered the popup
                createIntensityPopup(event, closestTrack);
            }
        }

        // Helper to find closest track based on mouse event
        function findClosestTrack(event) {
             const svgRect = svgElement.getBoundingClientRect();
             const mouseClientX = event.clientX;
             const mouseClientY = event.clientY;
             const svgPoint = svgElement.createSVGPoint();
             svgPoint.x = mouseClientX;
             svgPoint.y = mouseClientY;

             let closestTrack = null;
             let minDistanceSq = Infinity;

             try {
                 const inverseCTM = svgElement.getScreenCTM().inverse();
                 if (!inverseCTM) return { closestTrack, minDistanceSq }; // Return defaults if CTM fails

                 const pointTransformed = svgPoint.matrixTransform(inverseCTM);
                 const mouseX = pointTransformed.x;
                 const mouseY = pointTransformed.y;

                 tracksData.forEach(track => {
                     if (!track.element) return;
                     // Check distance to points on this track
                     track.points.forEach(point => {
                         if (!isNaN(point.x) && !isNaN(point.y)) {
                             const dx = point.x - mouseX;
                             const dy = point.y - mouseY;
                             const distSq = dx * dx + dy * dy;
                             if (distSq < minDistanceSq) {
                                 minDistanceSq = distSq;
                                 closestTrack = track;
                             }
                         }
                     });
                 });
             } catch (error) {
                 console.error("Error during coordinate transformation:", error);
             }
             return { closestTrack, minDistanceSq };
        }


        svgElement.addEventListener('mousemove', handleMouseMove);
        svgElement.addEventListener('mouseleave', handleMouseLeave);
        svgElement.addEventListener('click', handleMouseClick); // Add the click listener
        console.log("Hover and click interactions setup complete.");

        // Add global listeners for dismissal *once*
        document.addEventListener('keydown', handleEscapeKey);
        // Use mousedown for outside click - often more robust than click
        document.addEventListener('mousedown', handleMouseDownOutside, true);
    }

    // --- 7. Intensity Chart Pop-up Logic ---

    function createIntensityPopup(clickEvent, trackData) {
        // Calculate dynamic size
        const svgRect = svgElement.getBoundingClientRect();
        // Ensure a minimum size, make it square
        const popupSize = Math.max(50, Math.floor(svgRect.height / 3));

        // Create the popup div
        const popupDiv = document.createElement('div');
        popupDiv.className = 'intensity-chart-popup';
        // Set dynamic size
        popupDiv.style.width = `${popupSize}px`;
        popupDiv.style.height = `${popupSize}px`;

        document.body.appendChild(popupDiv);
        activePopup = popupDiv;
        activePopup.trackData = trackData;
        activePopup.clickEvent = clickEvent; // Store the click event

        // Draw the chart inside the popup, passing the calculated size
        drawIntensityChart(popupDiv, trackData, popupSize, popupSize);

        // Position the popup, passing the calculated size
        positionPopup(popupDiv, clickEvent, popupSize, popupSize);

        // Make it visible
        requestAnimationFrame(() => {
            popupDiv.classList.add('visible');
        });

        // Dismissal listeners are now added globally in setupInteractions
    }

    // Updated to accept dynamic size
    function positionPopup(popupDiv, clickEvent, popupWidth, popupHeight) {
        const margin = 10; // Minimum distance from edge

        let desiredLeft = clickEvent.pageX + 15;
        let desiredTop = clickEvent.pageY + 15;

        const svgRect = svgElement.getBoundingClientRect();
        // Use scrollX/scrollY for coordinates relative to document, not viewport
        const svgScrollX = window.scrollX + svgRect.left;
        const svgScrollY = window.scrollY + svgRect.top;

        // Adjust left position based on dynamic width
        if (desiredLeft + popupWidth + margin > svgScrollX + svgRect.width) {
            desiredLeft = clickEvent.pageX - popupWidth - 15;
        }
        if (desiredLeft < svgScrollX + margin) {
            desiredLeft = svgScrollX + margin;
        }

        // Adjust top position based on dynamic height
        if (desiredTop + popupHeight + margin > svgScrollY + svgRect.height) {
            desiredTop = clickEvent.pageY - popupHeight - 15;
        }
         if (desiredTop < svgScrollY + margin) {
            desiredTop = svgScrollY + margin;
        }

        popupDiv.style.left = `${desiredLeft}px`;
        popupDiv.style.top = `${desiredTop}px`;
    }

    // Updated to accept dynamic size and remove Y axis
    function drawIntensityChart(targetDiv, trackData, popupWidth, popupHeight) {
        const points = trackData.points;

        // --- Calculate Relative Frames ---
        if (points.length === 0) return;
        const minFrame = points[0].frame;
        const maxFrame = points[points.length - 1].frame;
        const relativeDuration = maxFrame - minFrame;
        // --- End Calculation ---


        // Adjust margins: Increase bottom margin significantly for label + padding
        const margin = { top: 25, right: 10, bottom: 45, left: 10 }; // Increased top for title, bottom for label
        const width = popupWidth - margin.left - margin.right;
        const height = popupHeight - margin.top - margin.bottom;

        // Ensure width/height are positive after subtracting margins
        if (width <= 5 || height <= 5) { // Need some minimal drawing space
            console.error("Popup size too small for chart margins.");
            targetDiv.innerHTML = `<p style="color: #eee; font-size: 10px; text-align: center; padding: 10px;">Chart area too small</p>`;
            return;
        }

        // Clear previous SVG if redrawing
        d3.select(targetDiv).select("svg").remove();

        const chartSvg = d3.select(targetDiv).append("svg")
            .attr("width", popupWidth)
            .attr("height", popupHeight)
            // Add viewbox for better scaling, especially if popup size isn't integer pixels
            .attr("viewBox", `0 0 ${popupWidth} ${popupHeight}`)
            .attr("preserveAspectRatio", "xMidYMid meet") // Standard preserve aspect ratio
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scales
        const xScale = d3.scaleLinear()
            .domain([0, relativeDuration])
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(points, d => d.intensity)])
            .nice()
            .range([height, 0]);

        // X Axis (only)
        const numTicks = relativeDuration > 100 ? 5 : (relativeDuration > 20 ? 3 : 2);
        // Use tickSizeInner and tickSizeOuter for better control if needed
        const xAxis = d3.axisBottom(xScale).ticks(numTicks).tickSizeOuter(0).tickPadding(5); // Increased padding

        const xAxisGroup = chartSvg.append("g")
            .attr("class", "x axis")
            .attr("transform", `translate(0,${height})`) // Position at the bottom of the chart area
            .call(xAxis);

        // Add X Axis Label
        xAxisGroup.append("text")
            .attr("class", "axis-label")
            .attr("x", width / 2)
            // Position below axis line: height of axis + padding. Adjust '20' as needed.
            .attr("y", margin.bottom - 10) // Position relative to the group's bottom margin space
            // .attr("dy", "1em") // Alternative positioning using dy
            // Removed fill/style here, rely on CSS
            .text("Frames");


        // Line generator
        const line = d3.line()
            .x(d => xScale(d.frame - minFrame))
            .y(d => yScale(d.intensity));

        // Draw the line
        chartSvg.append("path")
            .datum(points)
            .attr("class", "intensity-line")
            .attr("d", line);

        // Chart Title (adjust y position slightly due to increased top margin)
        chartSvg.append("text")
            .attr("class", "chart-title")
            .attr("x", width / 2)
            .attr("y", -margin.top / 2) // Position within the top margin area
            // Removed style here, rely on CSS
            .text(`Track ${trackData.id} Intensity`);
    }

    function removePopup() {
        if (activePopup) {
            const popupToRemove = activePopup; // Store reference
            activePopup = null; // Clear active reference immediately
            popupToRemove.classList.remove('visible');
            setTimeout(() => {
                 popupToRemove.remove();
            }, 200);
        }
        // Global listeners remain active
    }

    // --- Global Dismissal Handlers ---
    function handleEscapeKey(event) {
        if (event.key === "Escape" && activePopup) {
            removePopup();
        }
    }

    // Use mousedown for robustness
    function handleMouseDownOutside(event) {
        // Check if there IS an active popup AND
        // if the click target is NOT the popup itself OR any descendant of the popup AND
        // if the click target is NOT an SVG track (to prevent immediate dismissal when opening)
        if (activePopup &&
            !activePopup.contains(event.target) &&
            !event.target.closest('.firefly-track'))
        {
            removePopup();
        }
    }

    // --- Utility: Debounce ---
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