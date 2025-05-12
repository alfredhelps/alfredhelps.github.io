document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator');
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

    // Function to show typing indicator
    function showTypingIndicator() {
        // First remove the typing indicator if it exists in the DOM
        if (typingIndicator.parentNode) {
            typingIndicator.parentNode.removeChild(typingIndicator);
        }

        // Then append it to the end of the chat messages
        chatMessages.appendChild(typingIndicator);
        typingIndicator.style.display = 'flex';
        scrollToLastMessage()
    }

    // Function to hide typing indicator
    function hideTypingIndicator() {
        typingIndicator.style.display = 'none';
        // Remove from DOM to prevent it from taking up space
        if (typingIndicator.parentNode) {
            typingIndicator.parentNode.removeChild(typingIndicator);
        }
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
        const speed = 5;
        // Use larger chunks on mobile for better performance
        const chunkSize = window.innerWidth <= 768 ? 10 : 5;

        function typeWriter() {
            if (i < text.length) {
                const nextIndex = Math.min(i + chunkSize, text.length);
                const currentText = text.substring(0, nextIndex);
                textContainer.innerHTML = currentText + '<span class="cursor">|</span>';
                i = nextIndex;
                scrollToLastMessage()

                // Faster typing on mobile for better UX
                const randomDelay = window.innerWidth <= 768 ?
                    speed + Math.random() * 5 : // Faster on mobile
                    speed + Math.random() * 15; // Normal on desktop
                setTimeout(typeWriter, randomDelay);
            } else {
                // Remove cursor and convert markdown after typing is complete
                // Use the configured renderer to properly handle links
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
                // Make API request with streaming enabled
                const response = await fetch('http://localhost:3000/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        history: messages
                    }),
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

                    // Set up streaming
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let fullResponse = '';
                    let allToolsUsed = [];
                    let isTyping = false;
                    let typingQueue = '';
                    let hasStartedResponding = false;
                    const typingSpeed = 5; // Adjust typing speed (lower = faster)

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
                                if (line.startsWith('2:')) {
                                    // Tools used data
                                    const toolsData = JSON.parse(line.substring(2));
                                    if (toolsData[0] && toolsData[0].toolsUsed) {
                                        allToolsUsed = [...new Set([...allToolsUsed, ...toolsData[0].toolsUsed])];
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
                                    
                                    // If this is the first text chunk, replace typing indicator with message
                                    if (!hasStartedResponding) {
                                        hasStartedResponding = true;
                                        hideTypingIndicator();
                                        chatMessages.appendChild(messageDiv);
                                    }
                                    
                                    // Add to typing queue
                                    typingQueue += textChunk;
                                    
                                    // Start typing animation if not already typing
                                    if (!isTyping) {
                                        typeNextChunk();
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
                        // Add the complete message to our history
                        messages.push({
                            content: fullResponse,
                            assistant: true
                        });

                        // Final render of the message with markdown
                        textContainer.innerHTML = marked.parse(fullResponse);
                        scrollToLastMessage();

                        // Add subtle highlight animation after typing completes
                        messageDiv.style.transition = "box-shadow 0.3s ease";
                        messageDiv.style.boxShadow = "0 0 10px rgba(167, 139, 250, 0.4)";
                        setTimeout(() => {
                            messageDiv.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                        }, 500);

                        // Calculate response time
                        const endTime = Date.now();
                        const responseTime = ((endTime - startTime) / 1000).toFixed(1);

                        // Update response info with typing animation
                        const infoText = allToolsUsed.length
                            ? `${allToolsUsed.join(', ')} · ${responseTime}s`
                            : `Response time: ${responseTime}s`;
                        updateResponseInfo(infoText);
                    }
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
});
