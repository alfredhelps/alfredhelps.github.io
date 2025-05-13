const SERVER_URL = "https://alfred.privatedns.org/chat"
let sourceLinksTemplate

document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const reasonButton = document.getElementById('reason-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const exampleQuestions = document.getElementById('example-questions');
    const questionChips = document.querySelectorAll('.question-chip');
    const loaderWrapper = document.querySelector('.loader-wrapper');
    const thinkingIndicatorContainer = document.getElementById('thinking-indicator-container');
    const thinkingBar = document.getElementById('thinking-bar');
    const editButtonTemplate = document.getElementById('edit-button-template');
    const stopButtonTemplate = document.getElementById('stop-button-template');
    sourceLinksTemplate = document.getElementById('source-links-template');

    // Variables
    const messages = [];
    let isOnCooldown = false;
    let lastUserMessageDiv = null;
    let lastBotMessageDiv = null;
    const CooldownTime = 2000; // 2 second cooldown between messages
    let isReasoningEnabled = false;
    let currentResponseController = null; // To store the AbortController for the current response
    let stopGenerationContainer = null; // Reference to the stop generation button container

    // Function to show stop generation button
    function showStopGenerationButton() {
        // Remove any existing stop button
        hideStopGenerationButton();

        // Create container for stop button
        stopGenerationContainer = document.createElement('div');
        stopGenerationContainer.classList.add('stop-generation-container');

        // Clone the stop button template
        const stopButton = stopButtonTemplate.content.cloneNode(true).querySelector('.stop-generation-button');

        // Add click event to stop button
        stopButton.addEventListener('click', stopResponseGeneration);

        // Add the button to the container
        stopGenerationContainer.appendChild(stopButton);

        // Add the container to the body (not chat messages) to ensure fixed positioning works
        document.body.appendChild(stopGenerationContainer);
    }

    // Function to hide stop generation button
    function hideStopGenerationButton() {
        if (stopGenerationContainer && stopGenerationContainer.parentNode) {
            stopGenerationContainer.parentNode.removeChild(stopGenerationContainer);
            stopGenerationContainer = null;
        }
    }

    // Function to stop response generation
    function stopResponseGeneration() {
        if (currentResponseController) {
            // Abort the fetch request
            currentResponseController.abort();
            currentResponseController = null;

            // Hide the stop button
            hideStopGenerationButton();

            // Hide typing indicator and thinking bar
            hideTypingIndicator();
            hideThinkingBar();

            if (chatMessages.lastChild.classList.contains("bot-message")) {
                chatMessages.removeChild(chatMessages.lastChild)
            }

            // Add a message indicating the response was stopped
            const stoppedMessage = document.createElement('div');
            stoppedMessage.classList.add('system-message');
            stoppedMessage.textContent = 'Response generation stopped.';
            chatMessages.appendChild(stoppedMessage);
            scrollToLastMessage();

            // Reset cooldown
            setTimeout(() => {
                isOnCooldown = false;
                sendButton.classList.remove('disabled');
            }, 500); // Shorter cooldown after stopping
        }
    }

    // Add system message style
    function addSystemMessageStyle() {
        const style = document.createElement('style');
        style.textContent = `
            .system-message {
                text-align: center;
                padding: 8px 16px;
                margin: 10px auto;
                background-color: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                font-size: 14px;
                color: var(--text-secondary);
                max-width: 80%;
            }
        `;
        document.head.appendChild(style);
    }

    // Call this when the page loads
    addSystemMessageStyle();

    // Add this event listener to detect manual scrolling
    chatMessages.addEventListener('scroll', function () {
        isManualScrolling = true;
        // Reset the flag after scrolling stops
        clearTimeout(window.scrollTimeout);
        window.scrollTimeout = setTimeout(() => {
            isManualScrolling = false;
        }, 100);
    });

    // Toggle reasoning mode
    reasonButton.addEventListener('click', function (e) {
        // Prevent default behavior
        e.preventDefault();

        // Toggle reasoning mode
        isReasoningEnabled = !isReasoningEnabled;
        reasonButton.classList.toggle('active', isReasoningEnabled);

        // Refocus the input
        userInput.focus();
    });

    // Function to add copy button to bot messages
    function addCopyButton(messageDiv) {
        // Create copy button
        const copyButton = document.createElement('button');
        copyButton.classList.add('copy-button');
        copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy text';

        // Add click event to copy button
        copyButton.addEventListener('click', function (e) {
            e.stopPropagation(); // Prevent event bubbling

            // Find the corresponding message in the messages array
            // to get the original markdown content
            let markdownContent = '';

            // Try to find the message in the messages array
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].assistant && messageDiv === lastBotMessageDiv) {
                    markdownContent = messages[i].content;
                    break;
                }
            }

            // Copy to clipboard
            navigator.clipboard.writeText(markdownContent).then(() => {
                // Show success state
                copyButton.classList.add('copied');
                copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';

                // Reset after 2 seconds
                setTimeout(() => {
                    copyButton.classList.remove('copied');
                    copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy text';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                copyButton.innerHTML = '<i class="fas fa-times"></i> Failed to copy';

                // Reset after 2 seconds
                setTimeout(() => {
                    copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy text';
                }, 2000);
            });
        });

        // Add the copy button to the message but don't make it visible yet
        messageDiv.appendChild(copyButton);

        // IMPORTANT: Don't add the has-copy-button class immediately
        // Instead, wait for a small delay to allow CSS transitions to work
        // This is the key change to make the animation smooth
        setTimeout(() => {
            messageDiv.classList.add("has-copy-button");
        }, 100); // Slightly longer delay to ensure the transition works
    }

    // Function to add edit button to user message
    function addEditButton(messageDiv, originalText) {
        // Clone the edit button template
        const editButton = editButtonTemplate.content.cloneNode(true).querySelector('.edit-message-button');
        const MAX_CHARS = 1000; // Set 1,000 character limit

        // Make sure the button is visible
        editButton.style.display = 'flex';

        // Add click event to edit button
        editButton.addEventListener('click', function () {
            if (isOnCooldown) return;

            // Enter edit mode
            messageDiv.classList.add('editing');

            // Save the original content
            const originalContent = messageDiv.innerHTML;

            // Get the actual text content from the message div
            // This ensures we're editing the correct message
            const messageText = messageDiv.textContent.trim();

            // Create textarea with the message text
            const textarea = document.createElement('textarea');
            textarea.classList.add('edit-message-textarea');
            textarea.value = messageText.length > MAX_CHARS ? messageText.substring(0, MAX_CHARS) : messageText;
            textarea.setAttribute('maxlength', MAX_CHARS.toString());

            // Create action buttons
            const actions = document.createElement('div');
            actions.classList.add('edit-actions');

            const cancelButton = document.createElement('button');
            cancelButton.classList.add('edit-action-button', 'cancel');
            cancelButton.textContent = 'Cancel';

            const saveButton = document.createElement('button');
            saveButton.classList.add('edit-action-button', 'save');
            saveButton.textContent = 'Regenerate';

            actions.appendChild(cancelButton);
            actions.appendChild(saveButton);

            // Clear the message div and add the textarea, counter and actions
            messageDiv.innerHTML = '';
            messageDiv.appendChild(textarea);
            messageDiv.appendChild(actions);


            // Function to show character limit warning
            function showCharLimitWarning() {
                const warningMsg = document.createElement('div');
                warningMsg.classList.add('char-limit-warning');
                warningMsg.textContent = 'Character limit reached (1,000 max)';
                warningMsg.style.opacity = '1';

                document.body.appendChild(warningMsg);

                // Fade out and remove the warning message
                setTimeout(() => {
                    warningMsg.style.opacity = '0';
                    setTimeout(() => warningMsg.remove(), 500);
                }, 1500);
            }

            // Auto-resize the textarea based on content
            function resizeTextarea() {
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(300, Math.max(80, textarea.scrollHeight)) + 'px';

                // Check character limit
                if (textarea.value.length > MAX_CHARS) {
                    textarea.value = textarea.value.substring(0, MAX_CHARS);
                    showCharLimitWarning();
                }
            }

            // Initial resize
            setTimeout(resizeTextarea, 0);

            // Add input event to resize as user types
            textarea.addEventListener('input', resizeTextarea);

            // Focus the textarea
            textarea.focus();

            // Add event listeners to buttons
            cancelButton.addEventListener('click', function () {
                messageDiv.innerHTML = originalContent;
                messageDiv.classList.remove('editing');

                // Re-add edit button only if this is still the last user message
                if (messageDiv === lastUserMessageDiv) {
                    addEditButton(messageDiv, messageText);
                }
            });

            saveButton.addEventListener('click', function () {
                const newText = textarea.value.trim();
                if (newText && newText !== messageText) {
                    // Update the message in the UI
                    messageDiv.innerHTML = marked.parse(newText);
                    messageDiv.classList.remove('editing');

                    // Add edit button back only if this is still the last user message
                    if (messageDiv === lastUserMessageDiv) {
                        addEditButton(messageDiv, newText);
                    }

                    // Find the user message in the messages array and update it
                    for (let i = messages.length - 1; i >= 0; i--) {
                        if (!messages[i].assistant) {
                            messages[i].content = newText;

                            // Remove all messages after this one
                            messages.splice(i + 1);
                            break;
                        }
                    }

                    console.log("Edited message. Regenerating response...");
                    console.log("Updated messages array:", messages);

                    // Regenerate response
                    regenerateResponse(newText);
                } else {
                    // If no changes, just restore the original content
                    messageDiv.innerHTML = originalContent;
                    messageDiv.classList.remove('editing');

                    // Re-add edit button only if this is still the last user message
                    if (messageDiv === lastUserMessageDiv) {
                        addEditButton(messageDiv, messageText);
                    }
                }
            });
        });

        // Add the edit button to the message
        messageDiv.appendChild(editButton);

        // Force a reflow to ensure the button is visible
        setTimeout(() => {
            messageDiv.classList.add('has-edit-button');
        }, 10);
    }

    // Function to update edit buttons when a new message is sent
    function updateEditButtons() {
        // Remove edit buttons from all user messages
        const userMessages = document.querySelectorAll('.message.user-message');
        userMessages.forEach(msg => {
            const editButton = msg.querySelector('.edit-message-button');
            if (editButton) {
                editButton.remove();
            }
            msg.classList.remove('has-edit-button');
        });

        // Only add edit button to the last user message
        if (lastUserMessageDiv) {
            // Get the actual text content from the last user message
            const messageText = lastUserMessageDiv.textContent.trim();
            addEditButton(lastUserMessageDiv, messageText);
        }
    }

    // Function to create a bot message
    function createBotMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'bot-message');

        const botAvatar = document.createElement('img');
        botAvatar.src = "images/Alfred.png";
        botAvatar.alt = "Alfred Avatar";
        messageDiv.appendChild(botAvatar);

        // Create a container for the text
        const textContainer = document.createElement('div');
        textContainer.classList.add('typing-text-container');
        messageDiv.appendChild(textContainer);

        // Add copy button to the message
        addCopyButton(messageDiv);

        return { messageDiv, textContainer };
    }

    // Add a function to check if we're on mobile
    function isMobile() {
        return window.innerWidth <= 768;
    }

    // Add a function to update the UI based on screen size
    function updateUIForScreenSize() {
        if (isMobile()) {
            document.body.classList.add('mobile-view');
        } else {
            document.body.classList.remove('mobile-view');
        }

        // Ensure proper spacing after UI updates
        ensureProperSpacing();
    }

    // Add this function to ensure proper spacing between messages and input
    function ensureProperSpacing() {
        // Get the height of the input container
        const inputContainer = document.querySelector('.chat-input-container');
        const inputHeight = inputContainer.offsetHeight;

        // Add extra padding to account for shadows and ensure no overlap
        const extraPadding = 30;
        const totalPadding = inputHeight + extraPadding;

        // Apply padding to main and chat messages
        const main = document.querySelector('main');
        const chatMessages = document.querySelector('.chat-messages');

        main.style.paddingBottom = `${totalPadding}px`;
        chatMessages.style.paddingBottom = `${totalPadding - 20}px`;

        console.log(`Applied padding: ${totalPadding}px to prevent overlap`);
    }

    // Call this function on load and resize
    window.addEventListener('load', ensureProperSpacing);
    window.addEventListener('resize', ensureProperSpacing);

    // Add a resize event listener to handle orientation changes
    window.addEventListener('resize', function () {
        updateUIForScreenSize();

        // On orientation change, ensure proper scrolling
        if (lastBotMessageDiv || lastUserMessageDiv) {
            setTimeout(scrollToLastMessage, 300);
        }
    });

    // Function to regenerate response
    async function regenerateResponse(text) {
        if (isOnCooldown) return;

        // Set cooldown
        isOnCooldown = true;
        sendButton.classList.add('disabled');

        // IMPORTANT: Remove the previous bot message if it exists
        // Find all bot messages and remove the last one
        const botMessages = document.querySelectorAll('.message.bot-message');
        if (botMessages.length > 0) {
            const lastBotMessage = botMessages[botMessages.length - 1];
            if (lastBotMessage && lastBotMessage.parentNode) {
                lastBotMessage.remove();
            }
        }

        // Reset lastBotMessageDiv reference
        lastBotMessageDiv = null;

        // Show typing indicator
        showTypingIndicator();
        scrollToLastMessage();

        // Show stop generation button
        showStopGenerationButton();

        // Add a small delay to ensure the typing indicator is visible
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            console.log("Sending regeneration request to server...");
            console.log("Messages being sent:", JSON.stringify(messages));

            // Create a new AbortController for this request
            currentResponseController = new AbortController();
            const signal = currentResponseController.signal;

            // Make API request with streaming enabled
            const response = await fetch(SERVER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    history: messages,
                    thinking: isReasoningEnabled
                }),
                signal: signal // Add the abort signal
            });

            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.status}`);
            }

            // Create bot message element using the helper function
            const { messageDiv, textContainer } = createBotMessage();

            // Set up streaming
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            let hasStartedResponding = false;
            let messageSources = [];

            // Process the stream
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Decode the chunk and split by lines
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                // Process each line
                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const result = processStreamLine(line);

                        switch (result.type) {
                            case 'thinking':
                                showThinkingBar(result.data);
                                break;

                            case 'source':
                                messageSources.push(result.data);
                                break;

                            case 'text':
                                // If this is the first text chunk, replace typing indicator with message
                                if (!hasStartedResponding) {
                                    hasStartedResponding = true;
                                    hideTypingIndicator();
                                    chatMessages.appendChild(messageDiv);
                                }

                                // Process the text chunk
                                let textChunk = result.data;

                                // Replace escaped newlines with actual newlines
                                textChunk = textChunk.replace(/\\n/g, '\n');

                                // Add the text to the full response
                                fullResponse += textChunk;

                                // Get the HTML content from marked
                                const markedContent = marked.parse(fullResponse);

                                // Update the HTML with the full response
                                textContainer.innerHTML = markedContent;

                                // Find all text nodes in the container
                                const textNodes = [];
                                function findTextNodes(node) {
                                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                                        textNodes.push(node);
                                    } else {
                                        for (let i = 0; i < node.childNodes.length; i++) {
                                            findTextNodes(node.childNodes[i]);
                                        }
                                    }
                                }
                                findTextNodes(textContainer);

                                // Apply fade-in effect to the last text node (newest content)
                                if (textNodes.length > 0) {
                                    const lastTextNode = textNodes[textNodes.length - 1];
                                    const span = document.createElement('span');
                                    span.className = 'new-text-chunk';
                                    span.textContent = lastTextNode.textContent;
                                    lastTextNode.parentNode.replaceChild(span, lastTextNode);
                                }
                                break;

                            case 'tool':
                                // Show thinking bar if there's an action
                                if (result.data[0] && result.data[0].action) {
                                    showThinkingBar(result.data[0].action);
                                }

                                // Handle source if present
                                if (result.data[0] && result.data[0].source) {
                                    messageSources.push(result.data[0].source);
                                }

                                // Handle image attachment if present
                                if (result.data[0] && result.data[0].attachImage) {
                                    // Create image element
                                    const imageElement = document.createElement('img');
                                    imageElement.src = result.data[0].attachImage;
                                    imageElement.alt = "AI Generated Image";
                                    imageElement.classList.add('attached-image');

                                    // Add image to the message
                                    if (messageDiv) {
                                        // Create or get image container
                                        let imageContainer = messageDiv.querySelector('.image-container');
                                        if (!imageContainer) {
                                            imageContainer = document.createElement('div');
                                            imageContainer.classList.add('image-container');
                                            messageDiv.appendChild(imageContainer);
                                        }

                                        imageContainer.appendChild(imageElement);

                                        // Scroll to make sure the image is visible
                                        scrollToLastMessage();
                                    }
                                }
                                break;
                        }
                    } catch (e) {
                        console.error('Error processing line:', e, line);
                    }
                }
            }

            // If we never got a response, hide the typing indicator
            if (!hasStartedResponding) {
                hideTypingIndicator();
                chatMessages.appendChild(messageDiv);
                textContainer.innerHTML = '<em>No response received. Please try again.</em>';
            }

            // Finish response processing
            finishResponse();

            function finishResponse() {
                // Hide thinking bar if it's still showing
                hideThinkingBar();

                // Hide stop generation button
                hideStopGenerationButton();

                // Reset the response controller
                currentResponseController = null;

                // If we got a response, add sources if available
                if (hasStartedResponding) {
                    // Add source links if available
                    if (messageSources.length > 0) {
                        addSourceLinks(messageDiv, messageSources);
                    }

                    // Save reference to the bot message
                    lastBotMessageDiv = messageDiv;
                } else {
                    // If no response was received, show an error message
                    textContainer.innerHTML = '<em>No response received. Please try again.</em>';
                }
            }
        } catch (error) {
            console.error('Error:', error);
            hideTypingIndicator();
            hideThinkingBar();

            const systemMessage = document.createElement('div');
            systemMessage.classList.add('system-message');
            systemMessage.textContent = 'Sorry, there was an error processing your request. Please try again.';
            chatMessages.appendChild(systemMessage);
            scrollToLastMessage();
        }

        // Reset cooldown after the specified time
        setTimeout(() => {
            isOnCooldown = false;
            sendButton.classList.remove('disabled');
        }, CooldownTime);
    }

    // Function to show thinking bar with an action
    function showThinkingBar(action) {
        if (!action) return;

        // Update current thinking action
        currentThinkingAction = action;

        // Update thinking text
        const thinkingText = thinkingBar.querySelector('.thinking-text');
        thinkingText.textContent = `Thinking: ${action}`;

        // Show the container
        thinkingIndicatorContainer.style.opacity = '1';
    }

    // Function to hide thinking bar
    function hideThinkingBar() {
        // Hide the container
        thinkingIndicatorContainer.style.opacity = '0';
        currentThinkingAction = null;
    }

    // Check for query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuestion = urlParams.get('q');

    // If there's an initial question from the URL, use it after a short delay
    if (initialQuestion) {
        // Hide example questions immediately
        if (exampleQuestions) {
            exampleQuestions.classList.add('hide-examples');
        }

        // Wait for page to fully load before sending the initial question
        setTimeout(() => {
            // Set the input value to the decoded question
            userInput.value = decodeURIComponent(initialQuestion);
            // Trigger the send message function
            sendMessage();
        }, 1000); // Short delay to ensure everything is loaded
    }

    // Configure marked.js
    const renderer = new marked.Renderer();

    // Override the link renderer to add target="_blank" and rel attributes
    renderer.link = function (href, title, text) {
        const link = marked.Renderer.prototype.link.call(this, href, title, text);
        return link.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
    };

    marked.setOptions({
        renderer: renderer,
        highlight: function (code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });

    // Hide loader after page loads
    window.addEventListener('load', function () {
        setTimeout(() => {
            loaderWrapper.style.opacity = '0';
            loaderWrapper.style.visibility = 'hidden';
            userInput.focus();
        }, 500);
    });

    function scrollToLastMessage() {
        // Add a small delay to ensure DOM updates have completed
        setTimeout(() => {
            if (chatMessages.children.length > 0) {
                const lastMessage = chatMessages.children[chatMessages.children.length - 1];
                lastMessage.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                    inline: "nearest"
                });

                // Add extra scroll to ensure the message is not covered by the input
                // Use more padding on mobile
                const extraScroll = isMobile() ? 80 : 40;
                chatMessages.scrollTop += extraScroll;
            }
        }, 10);
    }

    // Function to show typing indicator
    function showTypingIndicator() {
        // First remove the typing indicator if it exists in the DOM
        if (typingIndicator.parentNode) {
            typingIndicator.parentNode.removeChild(typingIndicator);
        }

        // Clear any existing content
        typingIndicator.innerHTML = '';

        // Add avatar to typing indicator
        const botAvatar = document.createElement('img');
        botAvatar.src = "images/Alfred.png";
        botAvatar.alt = "Alfred Avatar";
        botAvatar.classList.add('typing-avatar');
        typingIndicator.appendChild(botAvatar);

        // Add the typing dots
        const dotsContainer = document.createElement('div');
        dotsContainer.classList.add('typing-dots-container');

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.classList.add('typing-dot');
            dotsContainer.appendChild(dot);
        }

        typingIndicator.appendChild(dotsContainer);

        // Then append it to the end of the chat messages
        chatMessages.appendChild(typingIndicator);
        typingIndicator.style.display = 'flex';
        scrollToLastMessage();

        console.log("Typing indicator shown");
    }

    // Function to hide typing indicator
    function hideTypingIndicator() {
        typingIndicator.style.display = 'none';
        // Remove from DOM to prevent it from taking up space
        if (typingIndicator.parentNode) {
            typingIndicator.parentNode.removeChild(typingIndicator);
        }

        console.log("Typing indicator hidden");
    }

    // Function to handle sending a message
    async function sendMessage() {
        const text = userInput.value.trim();
        const MAX_CHARS = 1000; // Set 1,000 character limit

        if (text && !isOnCooldown) {
            // Check character limit
            if (text.length > MAX_CHARS) {
                // Show warning and truncate
                const warningMsg = document.createElement('div');
                warningMsg.classList.add('char-limit-warning');
                warningMsg.textContent = 'Message truncated to 1,000 characters';
                warningMsg.style.opacity = '1';

                document.body.appendChild(warningMsg);

                // Fade out and remove the warning message
                setTimeout(() => {
                    warningMsg.style.opacity = '0';
                    setTimeout(() => warningMsg.remove(), 500);
                }, 1500);

                // Truncate the text
                userInput.value = text.substring(0, MAX_CHARS);
            }

            // Set cooldown
            isOnCooldown = true;
            sendButton.classList.add('disabled');

            // Get the final text (possibly truncated)
            const finalText = userInput.value.trim();

            // Clear input field immediately
            userInput.value = '';

            // Reset textarea height
            userInput.style.height = 'auto';

            // Create user message element once and don't modify it later
            const userMessageDiv = document.createElement('div');
            userMessageDiv.classList.add('message', 'user-message');
            userMessageDiv.innerHTML = marked.parse(finalText);
            chatMessages.appendChild(userMessageDiv);

            // Save reference to the last user message
            lastUserMessageDiv = userMessageDiv;

            // Update edit buttons to only show on the last user message
            updateEditButtons();

            // Hide example questions if they're still visible
            if (exampleQuestions && !exampleQuestions.classList.contains('hide-examples')) {
                exampleQuestions.classList.add('hide-examples');
            }

            // Add message to history
            messages.push({
                content: finalText,
                assistant: false
            });

            // Scroll to the new message
            scrollToLastMessage();

            // Show typing indicator
            showTypingIndicator();

            // Show stop generation button
            showStopGenerationButton();

            try {
                // Create a new AbortController for this request
                currentResponseController = new AbortController();
                const signal = currentResponseController.signal;

                // Make API request with streaming enabled
                const response = await fetch(SERVER_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        history: messages.slice(-30),
                        thinking: isReasoningEnabled
                    }),
                    signal: signal // Add the abort signal
                });

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                // Process response... (rest of the code remains the same)
                // Create bot message container in advance but don't add to DOM yet
                const { messageDiv, textContainer } = createBotMessage();

                // Set up streaming
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullResponse = '';
                let hasStartedResponding = false;
                let messageSources = [];

                // Process the stream
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // Decode the chunk and split by lines
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    // Process each line
                    for (const line of lines) {
                        if (!line.trim()) continue;

                        try {
                            const result = processStreamLine(line);

                            switch (result.type) {
                                case 'thinking':
                                    showThinkingBar(result.data);
                                    break;

                                case 'source':
                                    messageSources.push(result.data);
                                    break;

                                case 'text':
                                    // If this is the first text chunk, replace typing indicator with message
                                    if (!hasStartedResponding) {
                                        hasStartedResponding = true;
                                        hideTypingIndicator();
                                        chatMessages.appendChild(messageDiv);
                                    }

                                    // Process the text chunk
                                    let textChunk = result.data;

                                    // Replace escaped newlines with actual newlines
                                    textChunk = textChunk.replace(/\\n/g, '\n');

                                    // Add the text to the full response
                                    fullResponse += textChunk;

                                    // Get the HTML content from marked
                                    const markedContent = marked.parse(fullResponse);

                                    // Update the HTML with the full response
                                    textContainer.innerHTML = markedContent;

                                    // Find all text nodes in the container
                                    const textNodes = [];
                                    function findTextNodes(node) {
                                        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                                            textNodes.push(node);
                                        } else {
                                            for (let i = 0; i < node.childNodes.length; i++) {
                                                findTextNodes(node.childNodes[i]);
                                            }
                                        }
                                    }
                                    findTextNodes(textContainer);

                                    // Apply fade-in effect to the last text node (newest content)
                                    if (textNodes.length > 0) {
                                        const lastTextNode = textNodes[textNodes.length - 1];
                                        const span = document.createElement('span');
                                        span.className = 'new-text-chunk';
                                        span.textContent = lastTextNode.textContent;
                                        lastTextNode.parentNode.replaceChild(span, lastTextNode);
                                    }
                                    break;

                                case 'tool':
                                    // Show thinking bar if there's an action
                                    if (result.data[0] && result.data[0].action) {
                                        showThinkingBar(result.data[0].action);
                                    }

                                    // Handle source if present
                                    if (result.data[0] && result.data[0].source) {
                                        messageSources.push(result.data[0].source);
                                    }

                                    // Handle image attachment if present
                                    if (result.data[0] && result.data[0].attachImage) {
                                        // Create image element
                                        const imageElement = document.createElement('img');
                                        imageElement.src = result.data[0].attachImage;
                                        imageElement.alt = "AI Generated Image";
                                        imageElement.classList.add('attached-image');

                                        // Add image to the message
                                        if (messageDiv) {
                                            // Create or get image container
                                            let imageContainer = messageDiv.querySelector('.image-container');
                                            if (!imageContainer) {
                                                imageContainer = document.createElement('div');
                                                imageContainer.classList.add('image-container');
                                                messageDiv.appendChild(imageContainer);
                                            }

                                            imageContainer.appendChild(imageElement);

                                            // Scroll to make sure the image is visible
                                            scrollToLastMessage();
                                        }
                                    }
                                    break;
                            }
                        } catch (e) {
                            console.error('Error processing line:', e, line);
                        }
                    }
                }


                // If we never got a response, hide the typing indicator
                if (!hasStartedResponding) {
                    hideTypingIndicator();
                    chatMessages.appendChild(messageDiv);
                } else {
                    messages.push({
                        content: fullResponse,
                        assistant: true
                    })
                }
                // Finish response processing
                finishResponse();

                function finishResponse() {
                    // Hide thinking bar if it's still showing
                    hideThinkingBar();

                    // Hide stop generation button
                    hideStopGenerationButton();

                    // Reset the response controller
                    currentResponseController = null;

                    // If we got a response, add sources if available
                    if (hasStartedResponding) {
                        // Add source links if available
                        if (messageSources.length > 0) {
                            addSourceLinks(messageDiv, messageSources);
                        }

                        // Save reference to the bot message
                        lastBotMessageDiv = messageDiv;
                    } else {
                        // If no response was received, show an error message
                        textContainer.innerHTML = '<em>No response received. Please try again.</em>';
                    }
                }
            } catch (error) {
                console.error('Error:', error);
                hideTypingIndicator();
                hideThinkingBar(); // Hide thinking bar on error
                userMessageDiv.classList.remove('waiting');

                console.log(error.toString())

                if (!error.toString().includes("aborted")) {
                    const systemMessage = document.createElement('div');
                    systemMessage.classList.add('system-message');
                    systemMessage.textContent = 'Sorry, there was an error processing your request. Please try again.';
                    chatMessages.appendChild(systemMessage);
                }
                scrollToLastMessage();
            }

            // Reset cooldown after the specified time
            setTimeout(() => {
                isOnCooldown = false;
                sendButton.classList.remove('disabled');
            }, CooldownTime);
        } else if (isOnCooldown) {
            // Show cooldown message
            const cooldownMsg = document.createElement('div');
            cooldownMsg.classList.add('cooldown-message');
            cooldownMsg.textContent = 'Please wait before sending another message';
            cooldownMsg.style.opacity = '1';

            document.body.appendChild(cooldownMsg);

            // Fade out and remove the cooldown message
            setTimeout(() => {
                cooldownMsg.style.opacity = '0';
                setTimeout(() => cooldownMsg.remove(), 500);
            }, 1500);
        }
    }

    // Add click event listeners to question chips
    questionChips.forEach(chip => {
        chip.addEventListener('click', function () {
            if (!isOnCooldown) {
                const questionText = this.textContent;
                userInput.value = questionText;
                sendMessage();
            }
        });
    });

    // Event listeners
    sendButton.addEventListener('click', function () {
        if (!isOnCooldown) {
            sendMessage();
        }
    });

    // Remove the old keydown listener since we added it in setupTextareaAutoResize

    // Question chip event listeners
    questionChips.forEach(chip => {
        chip.addEventListener('click', function () {
            if (!isOnCooldown) {
                userInput.value = this.textContent;
                sendMessage();
            }
        });
    });



    // Adjust UI when keyboard appears on mobil

    // Focus input on page load
    setTimeout(() => {
        userInput.focus({ preventScroll: true });
    }, 500);

    // Optimize for mobile performance
    if (window.innerWidth <= 768) {
        // Disable animations
        document.body.classList.add('reduce-motion');

        // Use passive event listeners
        chatMessages.addEventListener('touchstart', function () { }, { passive: true });
        chatMessages.addEventListener('touchmove', function () { }, { passive: true });
    }

    // Function to update response info with typing animation
    function updateResponseInfo(text) {
        if (!text) {
            responseInfo.innerHTML = '';
            return;
        }

        // Clear previous content
        responseInfo.innerHTML = '';

        // Create typing container
        const infoTypingContainer = document.createElement('span');
        infoTypingContainer.classList.add('info-typing-container');
        responseInfo.appendChild(infoTypingContainer);

        // Typing animation for response info - slowed down a bit
        let i = 0;
        const infoSpeed = 5; // Slower typing speed (was 2)
        const infoChunkSize = 2; // Smaller chunks for more visible typing (was 3)

        function typeInfoText() {
            if (i < text.length) {
                const nextIndex = Math.min(i + infoChunkSize, text.length);
                const currentText = text.substring(0, nextIndex);
                infoTypingContainer.innerHTML = currentText + '<span class="info-cursor">|</span>';
                i = nextIndex;

                setTimeout(typeInfoText, infoSpeed);
            } else {
                // Remove cursor when done
                infoTypingContainer.innerHTML = text;
            }
        }

        typeInfoText();
    }

    // Add this function to handle auto-resizing of the textarea and text alignment
    function setupTextareaAutoResize() {
        const textarea = document.getElementById('user-input');
        const sendButton = document.getElementById('send-button');
        const MAX_CHARS = 1000; // Set 1,000 character limit

        // Function to resize the textarea based on content
        function resizeTextarea() {
            // Reset height to auto to get the correct scrollHeight
            textarea.style.height = 'auto';

            // Set the height to match content (with a max height)
            const newHeight = Math.min(textarea.scrollHeight, 120);
            textarea.style.height = newHeight + 'px';

            // Toggle text alignment based on content
            if (textarea.value.trim() === '') {
                sendButton.classList.remove('active');
            } else {
                sendButton.classList.add('active');
            }

            // Check character limit
            if (textarea.value.length > MAX_CHARS) {
                textarea.value = textarea.value.substring(0, MAX_CHARS);
                showCharLimitWarning();
            }

            // Update character counter if it exists
            updateCharCounter(textarea);
        }

        // Create and add character counter
        const charCounter = document.createElement('div');
        charCounter.classList.add('char-counter');
        charCounter.style.display = 'none'; // Initially hidden
        textarea.parentNode.appendChild(charCounter);

        // Function to update character counter
        function updateCharCounter(textareaElement) {
            const counter = textareaElement.parentNode.querySelector('.char-counter');
            if (counter) {
                const remaining = MAX_CHARS - textareaElement.value.length;
                counter.textContent = `${remaining} characters remaining`;

                // Show counter when text is entered
                if (textareaElement.value.length > 0) {
                    counter.style.display = 'block';
                } else {
                    counter.style.display = 'none';
                }

                // Change color when approaching limit
                if (remaining < 100) {
                    counter.classList.add('warning');
                } else {
                    counter.classList.remove('warning');
                }
            }
        }

        // Function to show character limit warning
        function showCharLimitWarning() {
            const warningMsg = document.createElement('div');
            warningMsg.classList.add('char-limit-warning');
            warningMsg.textContent = 'Character limit reached (1,000 max)';
            warningMsg.style.opacity = '1';

            document.body.appendChild(warningMsg);

            // Fade out and remove the warning message
            setTimeout(() => {
                warningMsg.style.opacity = '0';
                setTimeout(() => warningMsg.remove(), 500);
            }, 1500);
        }

        // Initial resize
        resizeTextarea();

        // Resize on input
        textarea.addEventListener('input', function () {
            resizeTextarea();
        });

        // Handle focus/blur for placeholder alignment
        textarea.addEventListener('focus', function () {
            // Show character counter on focus
            const counter = textarea.parentNode.querySelector('.char-counter');
            if (counter && textarea.value.length > 0) {
                counter.style.display = 'block';
            }
        });

        textarea.addEventListener('blur', function () {
            if (textarea.value.trim() === '') {
                textarea.style.textAlign = 'center';
            }
            // Hide character counter on blur
            const counter = textarea.parentNode.querySelector('.char-counter');
            if (counter) {
                counter.style.display = 'none';
            }
        });

        // Handle Enter key to send message (Shift+Enter for new line)
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !isOnCooldown) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Set max length attribute
        textarea.setAttribute('maxlength', MAX_CHARS.toString());
    }

    // Call this function in your DOMContentLoaded event
    setupTextareaAutoResize();

    // Handle iOS keyboard issues
    function setupIOSKeyboardFix() {
        // Only apply on iOS devices
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (isIOS) {
            // When input is focused, add a class to adjust positioning
            userInput.addEventListener('focus', function () {
                document.body.classList.add('keyboard-open');
                // Scroll to ensure the input is visible
                setTimeout(scrollToLastMessage, 300);
            });

            // When input loses focus, remove the class
            userInput.addEventListener('blur', function () {
                document.body.classList.remove('keyboard-open');
            });

            // Handle orientation changes on iOS
            window.addEventListener('orientationchange', function () {
                setTimeout(function () {
                    updateUIForScreenSize();
                    scrollToLastMessage();
                }, 500);
            });
        }
    }

    // Call this function in your DOMContentLoaded event
    setupIOSKeyboardFix();
});

// Function to add source links to a message
function addSourceLinks(messageDiv, sources) {
    if (!sources || !sources.length) return;

    // Check if we already have a source links container
    let sourceLinksContainer = messageDiv.querySelector('.source-links-container');
    let sourceLinksList;

    if (!sourceLinksContainer) {
        // Clone the template if we don't have a container yet
        sourceLinksContainer = sourceLinksTemplate.content.cloneNode(true).querySelector('.source-links-container');
        sourceLinksList = sourceLinksContainer.querySelector('.source-links-list');

        // Add collapsed class by default
        sourceLinksContainer.classList.add('collapsed');

        // Add click event to header to toggle collapse
        const header = sourceLinksContainer.querySelector('.source-links-header');
        header.addEventListener('click', function () {
            sourceLinksContainer.classList.toggle('collapsed');
        });

        messageDiv.appendChild(sourceLinksContainer);
    } else {
        // Use the existing container
        sourceLinksList = sourceLinksContainer.querySelector('.source-links-list');
    }

    // Add each source as a link
    sources.forEach(source => {
        // Check if this source is already in the list
        const existingLinks = Array.from(sourceLinksList.querySelectorAll('.source-link'));
        if (existingLinks.some(link => link.href === source)) {
            return; // Skip duplicates
        }

        const sourceLink = document.createElement('a');
        sourceLink.href = source;
        sourceLink.className = 'source-link';
        sourceLink.target = '_blank';
        sourceLink.rel = 'noopener noreferrer';

        // Extract filename or domain from the URL
        let displayText = source;
        const url = new URL(source);
        displayText = url.hostname;

        sourceLink.textContent = displayText;
        sourceLinksList.appendChild(sourceLink);
    });

    // Update the header text to show the number of sources
    const header = sourceLinksContainer.querySelector('.source-links-header');
    const sourceCount = sourceLinksList.querySelectorAll('.source-link').length;
    header.textContent = `Sources (${sourceCount})`;
}

// Helper function to process stream data
function processStreamLine(line, hasStartedResponding, typingQueue, messageSources) {
    // Check if line starts with 'data: ' or not
    let dataLine = line;
    if (line.startsWith('data: ')) {
        dataLine = line.substring(6);
    }

    // Skip empty lines
    if (!dataLine.trim()) return { type: 'empty' };

    // Handle different data types
    if (dataLine.startsWith('t:')) {
        // Thinking update
        const thinkingUpdate = dataLine.substring(2);
        return { type: 'thinking', data: thinkingUpdate };
    } else if (dataLine.startsWith('s:')) {
        // Source reference
        try {
            const sourceData = JSON.parse(dataLine.substring(2));
            return { type: 'source', data: sourceData };
        } catch (e) {
            console.error('Error parsing source data:', e);
            return { type: 'error', error: e };
        }
    } else if (dataLine.startsWith('0:')) {
        // Response text chunk
        let textChunk = dataLine.substring(2);

        // Remove double quotes at start and end if they exist
        if (textChunk.startsWith('"') && textChunk.endsWith('"')) {
            textChunk = textChunk.substring(1, textChunk.length - 1);
        }

        // Replace escaped newlines with actual newlines
        textChunk = textChunk.replace(/\\n/g, '\n');

        return { type: 'text', data: textChunk };
    } else if (dataLine.startsWith('2:')) {
        // Tools used data
        try {
            const toolsData = JSON.parse(dataLine.substring(2));
            return { type: 'tool', data: toolsData };
        } catch (e) {
            console.error('Error processing tools data:', e);
            return { type: 'error', error: e };
        }
    }

    // Default case for unrecognized data
    return { type: 'unknown', data: dataLine };
}
