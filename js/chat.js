document.addEventListener('DOMContentLoaded', () => {
    const SERVER_URL = "https://alfred.privatedns.org/chat";
    let noTrack = false;

    // DOM Elements
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const reasonToggleButton = document.getElementById('reason-toggle'); // Renamed for clarity
    const loaderWrapper = document.getElementById('loader-wrapper');
    const exampleQuestions = document.getElementById('example-questions');
    const questionChips = document.querySelectorAll('.question-chip');

    // State
    const messages = [];
    let isWaitingForResponse = false;
    let currentResponseController = null;
    let isReasoningEnabled = false; // Track reasoning state

    // --- Initialization ---
    const init = () => {
        setupEventListeners();
        handleURLParams();
        userInput.focus();
        setTimeout(() => {
            loaderWrapper.style.opacity = '0';
            loaderWrapper.style.visibility = 'hidden';
        }, 500);
    };

    const setupEventListeners = () => {
        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keydown', handleKeydown);
        userInput.addEventListener('input', handleInput);
        questionChips.forEach(chip => {
            chip.addEventListener('click', handleQuestionChipClick);
        });
        reasonToggleButton.addEventListener('click', toggleReasoning);
    };

    const handleURLParams = () => {
        const params = new URLSearchParams(window.location.search);
        const initialQuestion = params.get('q');
        if (initialQuestion) {
            userInput.value = decodeURIComponent(initialQuestion);
            sendMessage();
        }
        if (params.get('notrack') === 'true') {
            noTrack = true;
        }
    };

    // --- UI & State Management ---
    const handleKeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleInput = () => {
        sendButton.disabled = userInput.value.trim().length === 0;
        userInput.style.height = 'auto';
        userInput.style.height = `${userInput.scrollHeight}px`;
    };

    const setWaitingState = (isWaiting) => {
        isWaitingForResponse = isWaiting;
        userInput.disabled = isWaiting;
        sendButton.disabled = isWaiting;
        reasonToggleButton.disabled = isWaiting; // Disable the button
    };

    const handleQuestionChipClick = (e) => {
        userInput.value = e.target.textContent;
        sendMessage();
    };

    const hideExampleQuestions = () => {
        if (exampleQuestions) {
            exampleQuestions.classList.add('hide-examples');
        }
    };

    const toggleReasoning = () => {
        isReasoningEnabled = !isReasoningEnabled;
        reasonToggleButton.classList.toggle('active', isReasoningEnabled);
    };

    // --- Messaging ---
    const sendMessage = async () => {
        const text = userInput.value.trim();
        if (!text || isWaitingForResponse) return;

        hideExampleQuestions();
        setWaitingState(true);
        userInput.value = '';
        userInput.style.height = 'auto';

        addMessage(text, 'user');
        messages.push({ content: text, assistant: false });

        let tempThinkingIndicator = createTempThinkingIndicator();
        chatMessages.appendChild(tempThinkingIndicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            currentResponseController = new AbortController();
            const response = await fetch(SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    history: messages.slice(-30),
                    thinking: isReasoningEnabled, // Use the state variable
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    noTrack
                }),
                signal: currentResponseController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            await processStream(response, tempThinkingIndicator);

        } catch (error) {
            if (error.name !== 'AbortError') {
                addMessage('Sorry, something went wrong. Please try again.', 'bot', true);
            }
        } finally {
            if (tempThinkingIndicator && tempThinkingIndicator.parentNode) {
                tempThinkingIndicator.remove();
            }
            setWaitingState(false);
            userInput.focus();
        }
    };

    const processStream = async (response, tempThinkingIndicator) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let botMessageContent = '';
        let botMessageWrapper = null;
        let contentElement = null;
        let collectedSources = []; 

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('0:')) { 
                    if (!botMessageWrapper) {
                        if (tempThinkingIndicator && tempThinkingIndicator.parentNode) {
                            tempThinkingIndicator.remove();
                            tempThinkingIndicator = null;
                        }
                        botMessageWrapper = createMessageWrapper('bot');
                        contentElement = botMessageWrapper.querySelector('.message-content');
                        chatMessages.appendChild(botMessageWrapper);
                    }

                    let textChunk = line.substring(2);
                    if (textChunk.startsWith('"') && textChunk.endsWith('"')) {
                        textChunk = textChunk.slice(1, -1);
                    }
                    botMessageContent += textChunk.replace(/\\n/g, '\n');
                    contentElement.innerHTML = marked.parse(botMessageContent);
                    hljs.highlightAll();
                } else if (line.startsWith('2:')) { 
                    if (tempThinkingIndicator) { 
                         try {
                            const thoughtData = JSON.parse(line.substring(2));
                            if (thoughtData[0] && thoughtData[0].action) {
                                tempThinkingIndicator.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${thoughtData[0].action}`;
                            }
                            if (thoughtData[0] && thoughtData[0].source) {
                                collectedSources.push(thoughtData[0].source);
                            }
                        } catch (e) { console.error("Error parsing thought data:", e); }
                    }
                }
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        if (collectedSources.length > 0 && botMessageWrapper) {
            displaySources(botMessageWrapper, collectedSources);
        }

        if (botMessageWrapper && contentElement) {
            addCopyButtonListener(botMessageWrapper, contentElement);
        }

        messages.push({ content: botMessageContent, assistant: true });
    };

    const createTempThinkingIndicator = () => {
        const indicator = document.createElement('div');
        indicator.className = 'thought-process';
        indicator.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Alfred is thinking...`;
        return indicator;
    };

    const createMessageWrapper = (role) => {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${role}-message-wrapper`;

        if (role === 'bot') {
            const topContainer = document.createElement('div');
            topContainer.className = 'message-top-container';

            const avatar = document.createElement('img');
            avatar.src = 'images/Alfred.png';
            avatar.className = 'message-avatar';
            topContainer.appendChild(avatar);

            const h3 = document.createElement('h3');
            h3.textContent = 'AlfredHelps';
            topContainer.appendChild(h3);

            wrapper.appendChild(topContainer);
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}-message`;

        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        messageElement.appendChild(contentElement);

        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.title = 'Copy to clipboard';
        messageElement.appendChild(copyButton);

        wrapper.appendChild(messageElement);
        return wrapper;
    }

    const addMessage = (content, role, isError = false) => {
        const messageWrapper = createMessageWrapper(role);
        const contentElement = messageWrapper.querySelector('.message-content');
        contentElement.innerHTML = marked.parse(content);
        if(isError) messageWrapper.querySelector('.message').classList.add('error-message');
        
        chatMessages.appendChild(messageWrapper);

        chatMessages.scrollTop = chatMessages.scrollHeight;
        if (role === 'bot') {
            hljs.highlightAll();
        }
        return contentElement;
    };

    const copyToClipboard = async (text, button) => {
        try {
            await navigator.clipboard.writeText(text);
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                button.innerHTML = originalIcon;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    };

    const addCopyButtonListener = (messageWrapper, contentElement) => {
        const copyButton = messageWrapper.querySelector('.copy-button');
        if (copyButton) {
            copyButton.addEventListener('click', () => {
                const textToCopy = contentElement.innerText;
                copyToClipboard(textToCopy, copyButton);
            });
        }
    };

    const displaySources = (messageWrapper, sources) => {
        const sourceContainer = document.createElement('div');
        sourceContainer.className = 'source-container';
        sourceContainer.classList.add('collapsed'); // Start collapsed

        const sourceHeader = document.createElement('div');
        sourceHeader.className = 'source-header';
        sourceHeader.textContent = `Sources (${sources.length})`; // Add source count
        sourceHeader.addEventListener('click', () => {
            sourceContainer.classList.toggle('expanded'); // Toggle 'expanded' class
        });
        sourceContainer.appendChild(sourceHeader);

        const sourceList = document.createElement('ul');
        sourceList.className = 'source-list';
        sources.forEach(sourceUrl => {
            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.href = sourceUrl;
            link.textContent = new URL(sourceUrl).hostname; // Display hostname
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            listItem.appendChild(link);
            sourceList.appendChild(listItem);
        });
        sourceContainer.appendChild(sourceList);

        messageWrapper.appendChild(sourceContainer);
    };

    // --- Start ---
    init();
});