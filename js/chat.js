document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const actionIndicator = document.getElementById('action-indicator');
    const exampleQuestions = document.getElementById('example-questions');
    const responseInfo = document.getElementById('response-info');
    const questionChips = document.querySelectorAll('.question-chip');
    const loaderWrapper = document.querySelector('.loader-wrapper');
    const modelOptions = document.querySelectorAll('.model-option');

    // Variables
    const messages = [];
    let isOnCooldown = false;
    const CooldownTime = 2000; // 1 second cooldown between messages

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
        chatMessages.children[chatMessages.children.length - 1].scrollIntoView({ behavior: "smooth", block: "start" })
    }

    // Function to show typing indicator with action above
    function showTypingIndicator(action = null) {
        console.log("Showing typing indicator with action:", action);

        // First remove the typing indicator if it exists in the DOM
        if (typingIndicator.parentNode) {
            typingIndicator.parentNode.removeChild(typingIndicator);
        }

        // Reset styles before adding to DOM
        typingIndicator.style.opacity = '1';
        typingIndicator.style.transform = 'translateY(0)';
        typingIndicator.classList.remove('fade-out');
        typingIndicator.style.display = 'flex';

        // Always clear the action indicator content first
        actionIndicator.innerHTML = '';

        // Update action indicator if provided
        if (action) {
            console.log("Setting up action indicator with text:", action);

            // Reset action indicator styles
            actionIndicator.style.opacity = '1';
            actionIndicator.style.display = 'block';
            actionIndicator.classList.add('idle');

            // Create text container for typing animation
            actionIndicator.innerHTML = '<span class="action-text-container"></span>';
            const textContainer = actionIndicator.querySelector('.action-text-container');

            // Type out the text faster
            typeActionText(textContainer, action, 0, 10); // Faster typing speed (10ms)
        } else {
            actionIndicator.style.display = 'none';
        }

        // Add a content container for the response text
        const responseContainer = document.createElement('div');
        responseContainer.classList.add('typing-response-container');
        typingIndicator.appendChild(responseContainer);

        // Then append it to the end of the chat messages
        chatMessages.appendChild(typingIndicator);

        // Force a reflow to ensure mobile browsers render it properly
        void typingIndicator.offsetWidth;

        scrollToLastMessage();

        return responseContainer;
    }

    // Function to type out action text without cursor - with speed parameter
    function typeActionText(element, text, index, speed = 20) {
        if (index < text.length) {
            element.textContent = text.substring(0, index + 1);
            setTimeout(() => {
                typeActionText(element, text, index + 1, speed);
            }, speed + Math.random() * 5); // Faster typing with minimal randomization
        }
    }

    // Function to hide typing indicator smoothly
    function hideTypingIndicator() {
        if (typingIndicator.parentNode) {
            // Add fade-out class for smooth transition
            typingIndicator.classList.add('fade-out');

            // Return a promise that resolves when animation completes
            return new Promise(resolve => {
                setTimeout(() => {
                    if (typingIndicator.parentNode) {
                        typingIndicator.parentNode.removeChild(typingIndicator);
                    }
                    
                    // Also ensure action indicator is reset
                    actionIndicator.innerHTML = '';
                    actionIndicator.style.display = 'none';
                    
                    resolve();
                }, 300);
            });
        }
        return Promise.resolve(); // Return resolved promise if no indicator to hide
    }

    // Function to add a user message
    function addUserMessage(text) {
        messages.push({
            content: text,
            assistant: false
        });

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'user-message', 'waiting'); // Add waiting class
        // Use the configured renderer to properly handle links
        messageDiv.innerHTML = marked.parse(text);
        chatMessages.appendChild(messageDiv);
        scrollToLastMessage();

        // Hide example questions
        if (exampleQuestions) {
            exampleQuestions.classList.add('hide-examples');
        }

        // Store reference to the latest user message
        return messageDiv;
    }

    // Function to add a bot message with improved typing animation
    function addBotMessage(text) {
        messages.push({
            content: text,
            assistant: true
        });

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'bot-message');

        const botAvatar = document.createElement('img');
        botAvatar.src = "https://cdn.discordapp.com/avatars/717830171574403162/3ba757c892c384da23f0d9d5c15ae81c.png?size=512";
        botAvatar.alt = "Alfred Avatar";
        messageDiv.appendChild(botAvatar);

        // Create a container for the text
        const textContainer = document.createElement('div');
        textContainer.classList.add('typing-text-container');
        messageDiv.appendChild(textContainer);

        chatMessages.appendChild(messageDiv);
        scrollToLastMessage()

        // For all devices, add text with improved typing animation
        let i = 0;
        // Faster typing speed
        const speed = 2;
        // Use larger chunks for faster typing
        const chunkSize = window.innerWidth <= 768 ? 15 : 10;

        function typeWriter() {
            if (i < text.length) {
                const nextIndex = Math.min(i + chunkSize, text.length);
                const currentText = text.substring(0, nextIndex);
                textContainer.innerHTML = currentText;
                i = nextIndex;
                scrollToLastMessage()

                // Faster typing with minimal random delay
                const randomDelay = window.innerWidth <= 768 ?
                    speed + Math.random() * 2 : // Very fast on mobile
                    speed + Math.random() * 5;  // Fast on desktop
                setTimeout(typeWriter, randomDelay);
            } else {
                // Convert markdown after typing is complete
                textContainer.innerHTML = marked.parse(text);
                scrollToLastMessage()

                // Add subtle highlight animation after typing completes
                messageDiv.style.transition = "box-shadow 0.3s ease";
                messageDiv.style.boxShadow = "0 0 10px rgba(167, 139, 250, 0.4)";
                setTimeout(() => {
                    messageDiv.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                }, 500);
            }
        }

        typeWriter();
    }

    // Function to handle sending a message
    async function sendMessage() {
        const text = userInput.value.trim();
        if (text && !isOnCooldown) {
            // Set cooldown
            isOnCooldown = true;
            sendButton.classList.add('disabled');

            // Add user message and get reference to the message div
            const userMessageDiv = addUserMessage(text);
            userInput.value = '';

            // Show typing indicator at the end of the conversation
            showTypingIndicator();

            // Record start time
            const startTime = Date.now();

            try {
                const response = await fetch('https://alfred.privatedns.org/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: text,
                        history: messages.slice(-10) // Send last 10 messages for context
                    })
                });

                if (response.status === 429) {
                    // Handle rate limiting
                    hideTypingIndicator();
                    userMessageDiv.classList.remove('waiting');

                    const systemMessage = document.createElement('div');
                    systemMessage.classList.add('system-message');
                    systemMessage.textContent = 'You are sending messages too quickly. Please wait a moment and try again.';
                    chatMessages.appendChild(systemMessage);
                    scrollToLastMessage();

                    updateResponseInfo('Rate limited');
                } else if (!response.ok) {
                    userMessageDiv.classList.remove('waiting');
                    throw new Error(`HTTP error! Status: ${response.status}`);
                } else {
                    // Create bot message container in advance but don't add to DOM yet
                    userMessageDiv.classList.remove('waiting');

                    // Set up streaming
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let fullResponse = '';
                    let allToolsUsed = [];
                    let currentAction = null;
                    let hasStartedResponding = false;
                    let messageDiv = null;
                    let textContainer = null;

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
                                if (line.startsWith('2:')) {
                                    // Tools used data
                                    const toolsData = JSON.parse(line.substring(2));

                                    // Handle toolsUsed field if present
                                    if (toolsData[0] && toolsData[0].toolsUsed) {
                                        allToolsUsed = [...new Set([...allToolsUsed, ...toolsData[0].toolsUsed])];
                                    }

                                    // Handle action field if present
                                    if (toolsData[0] && toolsData[0].action) {
                                        const action = formatActionText(toolsData[0].action);
                                        currentAction = action; // Store for later if response hasn't started

                                        // Update action indicator based on whether response has started
                                        if (hasStartedResponding && messageDiv) {
                                            // If response has started, update action tag in the message
                                            updateActionTag(messageDiv, action);
                                        } else {
                                            // If response hasn't started, update the typing indicator
                                            updateActionIndicator(action);
                                        }
                                    }
                                } else if (line.startsWith('0:')) {
                                    // Response text chunk - remove quotes at start and end
                                    let textChunk = line.substring(2);

                                    // Remove double quotes at start and end if they exist
                                    if (textChunk.startsWith('"') && textChunk.endsWith('"')) {
                                        textChunk = textChunk.substring(1, textChunk.length - 1);
                                    }

                                    // Replace escaped newlines with actual newlines
                                    textChunk = textChunk.replace(/\\n/g, '\n');

                                    // If this is the first text chunk, create the message container
                                    if (!hasStartedResponding) {
                                        hasStartedResponding = true;

                                        // Hide typing indicator and wait for animation to complete before showing the message
                                        await hideTypingIndicator();

                                        // Create message container
                                        messageDiv = document.createElement('div');
                                        messageDiv.classList.add('message', 'bot-message');

                                        const botAvatar = document.createElement('img');
                                        botAvatar.src = "https://cdn.discordapp.com/avatars/717830171574403162/3ba757c892c384da23f0d9d5c15ae81c.png?size=512";
                                        botAvatar.alt = "Alfred Avatar";
                                        messageDiv.appendChild(botAvatar);

                                        // Create a container for the text
                                        textContainer = document.createElement('div');
                                        textContainer.classList.add('typing-text-container');
                                        messageDiv.appendChild(textContainer);

                                        // Add the message to the chat immediately
                                        chatMessages.appendChild(messageDiv);

                                        // If there's an action, add it to the bottom of the message immediately
                                        if (currentAction) {
                                            addActionTag(messageDiv, currentAction);
                                        }
                                    }

                                    // Add to full response
                                    fullResponse += textChunk;

                                    // Update the text container with the full response - IMPROVED TYPING EFFECT
                                    if (textContainer) {
                                        // Instead of replacing the entire content, simulate typing for just the new chunk
                                        const visibleLength = textContainer.textContent ? textContainer.textContent.length : 0;

                                        // Ensure we're not duplicating content by checking if the visible text matches our stored response
                                        if (visibleLength < fullResponse.length) {
                                            // Create a typing effect for just the new content
                                            animateTyping(textContainer, fullResponse, visibleLength);
                                        }
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

                        // Create an empty message
                        messageDiv = document.createElement('div');
                        messageDiv.classList.add('message', 'bot-message');

                        const botAvatar = document.createElement('img');
                        botAvatar.src = "https://cdn.discordapp.com/avatars/717830171574403162/3ba757c892c384da23f0d9d5c15ae81c.png?size=512";
                        botAvatar.alt = "Alfred Avatar";
                        messageDiv.appendChild(botAvatar);

                        // Create a container for the text
                        textContainer = document.createElement('div');
                        textContainer.classList.add('typing-text-container');
                        textContainer.textContent = "I'm sorry, I couldn't generate a response.";
                        messageDiv.appendChild(textContainer);

                        chatMessages.appendChild(messageDiv);
                    }

                    // Add the complete message to our history
                    messages.push({
                        content: fullResponse,
                        assistant: true
                    });

                    // Final render of the message with markdown
                    if (textContainer) {
                        // Just render the final markdown without any cursor
                        textContainer.innerHTML = marked.parse(fullResponse);
                        scrollToLastMessage();
                        
                        // Remove action tag when response is complete
                        if (messageDiv) {
                            removeActionTag(messageDiv);
                        }
                    }

                    // Add subtle highlight animation after typing completes
                    if (messageDiv) {
                        messageDiv.style.transition = "box-shadow 0.3s ease";
                        messageDiv.style.boxShadow = "0 0 10px rgba(167, 139, 250, 0.4)";
                        setTimeout(() => {
                            messageDiv.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                        }, 500);
                    }

                    // Calculate response time
                    const endTime = Date.now();
                    const responseTime = ((endTime - startTime) / 1000).toFixed(1);

                    // Update response info with typing animation
                    const infoText = allToolsUsed.length
                        ? `${allToolsUsed.join(', ')} · ${responseTime}s`
                        : `Response time: ${responseTime}s`;
                    updateResponseInfo(infoText);
                }
            } catch (error) {
                console.error('Error:', error);
                hideTypingIndicator();
                userMessageDiv.classList.remove('waiting');

                const systemMessage = document.createElement('div');
                systemMessage.classList.add('system-message');
                systemMessage.textContent = 'Sorry, there was an error processing your request. Please try again.';
                chatMessages.appendChild(systemMessage);
                scrollToLastMessage();

                responseInfo.innerHTML = 'Error occurred';
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

    // Add click event listeners to model options
    modelOptions.forEach(option => {
        option.addEventListener('click', function () {
            modelOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Event listeners
    sendButton.addEventListener('click', sendMessage);

    userInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            if (window.innerWidth <= 768) {
                userInput.blur()
            }
            sendMessage();
        }
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
        const infoSpeed = 15; // Slower typing speed (was 2)
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

    // Function to format action text for display
    function formatActionText(action) {
        console.log("Formatting action text:", action); // Debug log
        // If action is already formatted, return it as is
        if (typeof action === 'string') {
            return action;
        }
        // If it's an object with a description, use that
        if (action && action.description) {
            return action.description;
        }
        // Default fallback
        return "Processing...";
    }

    // Function to handle action updates in the response stream
    function updateActionIndicator(action) {
        const formattedAction = formatActionText(action);
        console.log("Updating action indicator with:", formattedAction);

        // Always update the action indicator in the typing indicator
        if (actionIndicator) {
            // Reset action indicator styles
            actionIndicator.style.opacity = '1';
            actionIndicator.style.display = 'block';
            actionIndicator.classList.add('idle');

            // Create text container for typing animation
            actionIndicator.innerHTML = '<span class="action-text-container"></span>';
            const textContainer = actionIndicator.querySelector('.action-text-container');

            // Type out the text faster
            typeActionText(textContainer, formattedAction, 0, 10); // Faster typing speed (10ms)
        }

        scrollToLastMessage();
    }

    // New function to animate typing for streaming responses
    function animateTyping(element, fullText, startIndex = 0) {
        const charsPerFrame = 1;
        const frameDuration = 10;
        let currentIndex = startIndex;
        
        function typeNextChars() {
            if (currentIndex < fullText.length) {
                // Calculate how many characters to add in this frame
                const nextIndex = Math.min(currentIndex + charsPerFrame, fullText.length);
                const currentText = fullText.substring(0, nextIndex);
                
                // Parse the markdown without adding any cursor
                element.innerHTML = marked.parse(currentText);
                
                // Update the index
                currentIndex = nextIndex;
                
                // Schedule the next frame
                setTimeout(typeNextChars, frameDuration);
                
                // Scroll to keep the latest content in view
                scrollToLastMessage();
            }
            // No else block needed - we're done when typing is complete
        }
        
        // Start the typing animation
        typeNextChars();
    }

    // Helper function to insert cursor at the end of content, before closing tags
    function insertCursorAtEnd(html) {
        // If the HTML ends with a closing tag (like </p>, </code>, etc.)
        const lastClosingTagMatch = html.match(/(<\/[^>]+>)+$/);

        if (lastClosingTagMatch) {
            // Insert cursor before the closing tags
            const closingTags = lastClosingTagMatch[0];
            const contentBeforeTags = html.substring(0, html.length - closingTags.length);
            return contentBeforeTags + '<span class="cursor">|</span>' + closingTags;
        } else {
            // No closing tags, just append cursor
            return html + '<span class="cursor">|</span>';
        }
    }

    // Helper function to add an action tag to a message
    function addActionTag(messageDiv, actionText) {
        // First check if there's already an action tag and remove it
        const existingTag = messageDiv.querySelector('.message-action-tag');
        if (existingTag) {
            existingTag.remove();
        }
        
        const actionTag = document.createElement('div');
        actionTag.classList.add('message-action-tag', 'idle');
        actionTag.id = 'current-action-tag';

        // Create text container for typing animation (no cursor)
        actionTag.innerHTML = '<span class="action-text-container"></span>';
        messageDiv.appendChild(actionTag);

        // Type out the text
        const actionTextContainer = actionTag.querySelector('.action-text-container');
        typeActionText(actionTextContainer, actionText, 0);
    }

    // Helper function to update an existing action tag
    function updateActionTag(messageDiv, actionText) {
        let actionTag = document.getElementById('current-action-tag');
        if (!actionTag) {
            addActionTag(messageDiv, actionText);
        } else {
            // If action changed, update with typing animation
            // Clear previous content first
            actionTag.innerHTML = '<span class="action-text-container"></span>';
            const textContainer = actionTag.querySelector('.action-text-container');
            typeActionText(textContainer, actionText, 0);
        }
        scrollToLastMessage();
    }

    // Add this new function to remove action tags when response is complete
    function removeActionTag(messageDiv) {
        const actionTag = messageDiv.querySelector('.message-action-tag');
        if (actionTag) {
            actionTag.classList.add('fade-out');
            setTimeout(() => {
                if (actionTag.parentNode) {
                    actionTag.parentNode.removeChild(actionTag);
                }
            }, 300);
        }
    }
});
