const URL = "https://alfred.privatedns.org/chat"
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
    sourceLinksTemplate = document.getElementById('source-links-template');
    let currentThinkingAction = null;

    // Variables
    const messages = [];
    let isOnCooldown = false;
    let lastUserMessageDiv = null;
    let lastBotMessageDiv = null;
    const CooldownTime = 2000; // 2 second cooldown between messages
    let isReasoningEnabled = false;

    // Toggle reasoning mode
    reasonButton.addEventListener('click', function () {
        isReasoningEnabled = !isReasoningEnabled;
        reasonButton.classList.toggle('active', isReasoningEnabled);
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

            // If we couldn't find it in the array, fall back to the text content
            if (!markdownContent) {
                // Get text content from the message, excluding the button text
                const textContainer = messageDiv.querySelector('.typing-text-container');
                markdownContent = textContainer ? textContainer.textContent.trim() : messageDiv.textContent.trim();
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

        // Add the copy button to the message
        messageDiv.appendChild(copyButton);
    }

    // Function to add edit button to user message
    function addEditButton(messageDiv, originalText) {
        // Clone the edit button template
        const editButton = editButtonTemplate.content.cloneNode(true).querySelector('.edit-message-button');
        const MAX_CHARS = 1000; // Set 1,000 character limit

        // Make sure the button is visible
        editButton.style.display = 'flex';

        // Add click event to edit button
        editButton.addEventListener('click', function() {
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

            // Create character counter
            const charCounter = document.createElement('div');
            charCounter.classList.add('char-counter', 'edit-char-counter');
            const remaining = MAX_CHARS - textarea.value.length;
            charCounter.textContent = `${remaining} characters remaining`;
            
            // Add warning class if approaching limit
            if (remaining < 100) {
                charCounter.classList.add('warning');
            }

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
            messageDiv.appendChild(charCounter);
            messageDiv.appendChild(actions);

            // Function to update character counter
            function updateCharCounter() {
                const remaining = MAX_CHARS - textarea.value.length;
                charCounter.textContent = `${remaining} characters remaining`;
                
                // Change color when approaching limit
                if (remaining < 100) {
                    charCounter.classList.add('warning');
                } else {
                    charCounter.classList.remove('warning');
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

            // Auto-resize the textarea based on content
            function resizeTextarea() {
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(300, Math.max(80, textarea.scrollHeight)) + 'px';
                
                // Check character limit
                if (textarea.value.length > MAX_CHARS) {
                    textarea.value = textarea.value.substring(0, MAX_CHARS);
                    showCharLimitWarning();
                }
                
                updateCharCounter();
            }

            // Initial resize
            setTimeout(resizeTextarea, 0);

            // Add input event to resize as user types
            textarea.addEventListener('input', resizeTextarea);

            // Focus the textarea
            textarea.focus();

            // Add event listeners to buttons
            cancelButton.addEventListener('click', function() {
                messageDiv.innerHTML = originalContent;
                messageDiv.classList.remove('editing');

                // Re-add edit button only if this is still the last user message
                if (messageDiv === lastUserMessageDiv) {
                    addEditButton(messageDiv, messageText);
                }
            });

            saveButton.addEventListener('click', function() {
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
            
            // Ensure proper spacing when switching to mobile
            const botMessages = document.querySelectorAll('.message.bot-message');
            botMessages.forEach(msg => {
                msg.style.marginBottom = '50px';
            });
            
            // Adjust the last message to ensure it's not covered by input
            if (lastBotMessageDiv) {
                lastBotMessageDiv.style.marginBottom = '60px';
            }
        } else {
            document.body.classList.remove('mobile-view');
            
            // Reset margins when switching to desktop
            const botMessages = document.querySelectorAll('.message.bot-message');
            botMessages.forEach(msg => {
                msg.style.marginBottom = '45px';
            });
        }
        
        // Force a scroll update to ensure the last message is visible
        scrollToLastMessage();
    }

    // Call this function on page load and resize
    window.addEventListener('load', updateUIForScreenSize);
    window.addEventListener('resize', updateUIForScreenSize);

    // Add a resize event listener to handle orientation changes
    window.addEventListener('resize', function() {
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

        // Add a small delay to ensure the typing indicator is visible
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            console.log("Sending regeneration request to server...");
            console.log("Messages being sent:", JSON.stringify(messages));

            // Make API request with streaming enabled
            const response = await fetch(URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    history: messages,
                    thinking: isReasoningEnabled
                }),
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
            let isTyping = false;
            let typingQueue = '';
            let hasStartedResponding = false;
            const typingSpeed = 5; // Adjust typing speed (lower = faster)
            let messageSources = [];

            // Function to simulate typing animation
            function typeNextChunk() {
                if (typingQueue.length === 0) {
                    isTyping = false;
                    return;
                }

                isTyping = true;

                // Type a few characters at a time for better performance
                const chunkSize = window.innerWidth <= 768 ? 10 : 5; // Larger chunks on mobile
                const nextChunk = typingQueue.substring(0, chunkSize);
                typingQueue = typingQueue.substring(chunkSize);

                fullResponse += nextChunk;
                textContainer.innerHTML = marked.parse(fullResponse) + '<span class="cursor">|</span>';
                scrollToLastMessage();

                // Random delay for more natural typing
                const randomDelay = window.innerWidth <= 768 ?
                    typingSpeed + Math.random() * 5 : // Faster on mobile
                    typingSpeed + Math.random() * 15; // Normal on desktop

                setTimeout(typeNextChunk, randomDelay);
            }

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

                    console.log(line);
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
                                
                                // Add to typing queue
                                typingQueue += result.data;
                                
                                // Start typing animation if not already typing
                                if (!isTyping) {
                                    typeNextChunk();
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

            // Make sure all remaining text is typed out
            if (typingQueue.length > 0) {
                // Wait for typing to finish
                const checkTyping = setInterval(() => {
                    if (!isTyping && typingQueue.length === 0) {
                        clearInterval(checkTyping);
                        finishResponse();
                    }
                }, 100);
            } else {
                finishResponse();
            }

            function finishResponse() {
                // Hide thinking bar if it's still showing
                hideThinkingBar();

                // Add the complete message to our history
                if (fullResponse) {
                    messages.push({
                        content: fullResponse,
                        assistant: true
                    });

                    // Final render of the message with markdown
                    textContainer.innerHTML = marked.parse(fullResponse);

                    // Add source links if available
                    if (messageSources.length > 0) {
                        addSourceLinks(messageDiv, messageSources);
                        messageSources = [];
                    }

                    // Add subtle highlight animation after typing completes
                    messageDiv.style.transition = "box-shadow 0.3s ease";
                    messageDiv.style.boxShadow = "0 0 10px rgba(167, 139, 250, 0.4)";
                    setTimeout(() => {
                        messageDiv.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                    }, 500);

                    // Save reference to the bot message
                    lastBotMessageDiv = messageDiv;
                } else {
                    // If no response was received, show an error message
                    textContainer.innerHTML = '<em>No response received. Please try again.</em>';
                }

                scrollToLastMessage();
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

            try {
                // Make API request with streaming enabled
                const response = await fetch(URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        history: messages.slice(-30),
                        thinking: isReasoningEnabled
                    }),
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
                let isTyping = false;
                let typingQueue = '';
                let hasStartedResponding = false;
                const typingSpeed = 5; // Adjust typing speed (lower = faster)
                let messageSources = [];

                // Function to simulate typing animation
                function typeNextChunk() {
                    if (typingQueue.length === 0) {
                        isTyping = false;
                        return;
                    }

                    isTyping = true;

                    // Type a few characters at a time for better performance
                    const chunkSize = window.innerWidth <= 768 ? 10 : 5; // Larger chunks on mobile
                    const nextChunk = typingQueue.substring(0, chunkSize);
                    typingQueue = typingQueue.substring(chunkSize);

                    fullResponse += nextChunk;
                    textContainer.innerHTML = marked.parse(fullResponse) + '<span class="cursor">|</span>';
                    scrollToLastMessage();

                    // Random delay for more natural typing
                    const randomDelay = window.innerWidth <= 768 ?
                        typingSpeed + Math.random() * 5 : // Faster on mobile
                        typingSpeed + Math.random() * 15; // Normal on desktop

                    setTimeout(typeNextChunk, randomDelay);
                }

                // Process the stream
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // Decode the chunk
                    const chunk = decoder.decode(value, { stream: true });

                    // Process each line in the chunk
                    const lines = chunk.split('\n').filter(line => line.trim());

                    for (const line of lines) {
                        try {
                            // Handle data based on prefix
                            // Check if line starts with 'data: ' or not
                            let dataLine = line;
                            if (line.startsWith('data: ')) {
                                dataLine = line.substring(6);
                            }

                            // Skip empty lines
                            if (!dataLine.trim()) continue;

                            // Handle different data types
                            if (dataLine.startsWith('2:')) {
                                // Tools used data
                                try {
                                    const toolsData = JSON.parse(dataLine.substring(2));
                                    console.log(toolsData[0]);

                                    // Show thinking bar if there's an action
                                    if (toolsData[0] && toolsData[0].action) {
                                        showThinkingBar(toolsData[0].action);
                                    }

                                    // Handle source if present
                                    if (toolsData[0] && toolsData[0].source) {
                                        // Add to sources array
                                        messageSources.push(toolsData[0].source);
                                    }

                                    // Handle image attachment if present
                                    if (toolsData[0] && toolsData[0].attachImage) {
                                        // Create image element
                                        const imageElement = document.createElement('img');
                                        imageElement.src = toolsData[0].attachImage;
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
                                } catch (e) {
                                    console.error('Error processing tools data:', e);
                                }
                            } else if (dataLine.startsWith('0:')) {
                                // Response text chunk - don't hide thinking bar yet
                                // Just show the message if it's the first chunk
                                if (!hasStartedResponding) {
                                    hasStartedResponding = true;

                                    // Hide typing indicator and show message div
                                    hideTypingIndicator();
                                    chatMessages.appendChild(messageDiv);
                                }

                                // Rest of the existing code for handling text chunks
                                let textChunk = dataLine.substring(2);

                                // Remove double quotes at start and end if they exist
                                if (textChunk.startsWith('"') && textChunk.endsWith('"')) {
                                    textChunk = textChunk.substring(1, textChunk.length - 1);
                                }

                                // Replace escaped newlines with actual newlines
                                textChunk = textChunk.replace(/\\n/g, '\n');

                                // Add to typing queue
                                typingQueue += textChunk;

                                // Start typing animation if not already typing
                                if (!isTyping) {
                                    typeNextChunk();
                                }
                            } else if (dataLine.startsWith('t:')) {
                                // Thinking update
                                const thinkingUpdate = dataLine.substring(2);
                                showThinkingBar(thinkingUpdate);
                            } else if (dataLine.startsWith('s:')) {
                                // Source reference
                                try {
                                    const sourceData = JSON.parse(dataLine.substring(2));
                                    messageSources.push(sourceData);
                                } catch (e) {
                                    console.error('Error parsing source data:', e);
                                }
                            }
                            // Ignore e: and d: lines as they're just metadata
                        } catch (e) {
                            console.error('Error processing line:', e, line);
                        }
                    }
                }

                // If we never got a response, hide the typing indicator
                if (!hasStartedResponding) {
                    hideTypingIndicator();
                    chatMessages.appendChild(messageDiv);
                }

                // Make sure all remaining text is typed out
                if (typingQueue.length > 0) {
                    // Wait for typing to finish
                    const checkTyping = setInterval(() => {
                        if (!isTyping && typingQueue.length === 0) {
                            clearInterval(checkTyping);
                            finishResponse();
                        }
                    }, 100);
                } else {
                    finishResponse();
                }

                function finishResponse() {
                    // Hide thinking bar if it's still showing
                    hideThinkingBar();

                    // Add the complete message to our history
                    messages.push({
                        content: fullResponse,
                        assistant: true
                    });

                    // Final render of the message with markdown
                    textContainer.innerHTML = marked.parse(fullResponse);
                    scrollToLastMessage();

                    // Add source links if available
                    if (messageSources.length > 0) {
                        addSourceLinks(messageDiv, messageSources);
                        messageSources = [];
                    }

                    // Add subtle highlight animation after typing completes
                    messageDiv.style.transition = "box-shadow 0.3s ease";
                    messageDiv.style.boxShadow = "0 0 10px rgba(167, 139, 250, 0.4)";
                    setTimeout(() => {
                        messageDiv.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                    }, 500);
                }
            } catch (error) {
                console.error('Error:', error);
                hideTypingIndicator();
                hideThinkingBar(); // Hide thinking bar on error
                userMessageDiv.classList.remove('waiting');

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

    function updateVh() {
        scrollToLastMessage()
    }
    window.addEventListener('resize', updateVh);



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
                textarea.style.textAlign = 'center';
                sendButton.classList.remove('active');
            } else {
                textarea.style.textAlign = 'left';
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
        textarea.addEventListener('input', function() {
            resizeTextarea();
        });

        // Handle focus/blur for placeholder alignment
        textarea.addEventListener('focus', function() {
            if (textarea.value.trim() === '') {
                // Immediately change to left alignment when focused
                textarea.style.textAlign = 'left';
            }
            // Show character counter on focus
            const counter = textarea.parentNode.querySelector('.char-counter');
            if (counter && textarea.value.length > 0) {
                counter.style.display = 'block';
            }
        });

        textarea.addEventListener('blur', function() {
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
        textarea.addEventListener('keydown', function(e) {
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
            userInput.addEventListener('focus', function() {
                document.body.classList.add('keyboard-open');
                // Scroll to ensure the input is visible
                setTimeout(scrollToLastMessage, 300);
            });
            
            // When input loses focus, remove the class
            userInput.addEventListener('blur', function() {
                document.body.classList.remove('keyboard-open');
            });
            
            // Handle orientation changes on iOS
            window.addEventListener('orientationchange', function() {
                setTimeout(function() {
                    updateUIForScreenSize();
                    scrollToLastMessage();
                }, 500);
            });
        }
    }

    // Call this function in your DOMContentLoaded event
    setupIOSKeyboardFix();
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

        // If we couldn't find it in the array, fall back to the text content
        if (!markdownContent) {
            // Get text content from the message, excluding the button text
            const textContainer = messageDiv.querySelector('.typing-text-container');
            markdownContent = textContainer ? textContainer.textContent.trim() : messageDiv.textContent.trim();
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

    // Add the copy button to the message
    messageDiv.appendChild(copyButton);
}

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
        try {
            const url = new URL(source);
            displayText = url.hostname || url.pathname.split('/').pop();
        } catch (e) {
            // If not a valid URL, just use the last part of the path
            displayText = source.split('/').pop();
        }

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
