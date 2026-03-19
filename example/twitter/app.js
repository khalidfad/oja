import { Router, Out, layout, modal, notify, keys, on, debounce, context } from '../../build/oja.core.esm.js';

export const[currentUser, setCurrentUser] = context('user', {
    id       : '1',
    name     : 'Alex Johnson',
    username : 'alexj',
    avatar   : 'A',
    bio      : 'Building things with Oja • Previously @startup',
    followers: 1243,
    following: 342,
});

export const [tweets, setTweets] = context('tweets',[
    {
        id           : '1',
        userId       : '1',
        content      : 'Just built a Twitter clone with Oja in 200 lines of code. No build step. No dependencies. Just HTML and JS. This framework is magic! ✨',
        likes        : 342,
        retweets     : 89,
        replies      : 23,
        timestamp    : Date.now() - 3600000,
        liked        : false,
        retweeted    : false,
    },
    {
        id           : '2',
        userId       : '2',
        userName     : 'Sarah Chen',
        userUsername : 'sarahcodes',
        userAvatar   : 'S',
        content      : 'The web is healing. We\'re moving back to simplicity. Oja feels like what the web should have always been.',
        likes        : 567,
        retweets     : 123,
        replies      : 45,
        timestamp    : Date.now() - 7200000,
        liked        : true,
        retweeted    : false,
    },
    {
        id           : '3',
        userId       : '3',
        userName     : 'Marcus Williams',
        userUsername : 'marcusw',
        userAvatar   : 'M',
        content      : 'Hot take: frameworks should get out of your way. Oja does exactly that. Write HTML. Add data. Done.',
        likes        : 234,
        retweets     : 56,
        replies      : 12,
        timestamp    : Date.now() - 10800000,
        liked        : false,
        retweeted    : true,
    },
]);

export const [trends] = context('trends',[
    { category: 'Technology', name: 'OjaFramework', tweets: '12.5K' },
    { category: 'Technology', name: 'WebDev',       tweets: '45.2K' },
    { category: 'Technology', name: 'JavaScript',   tweets: '89.1K' },
    { category: 'News',       name: 'Simplicity',   tweets: '23.4K' },
    { category: 'Tech',       name: 'NoBuild',      tweets: '8.7K'  },
]);

const router = new Router({ mode: 'hash', outlet: '#main-outlet' });

router.Use(async (ctx, next) => {
    const start = performance.now();
    await next();
    console.debug(`[oja/router] → ${ctx.path} (${Math.round(performance.now() - start)}ms)`);
});

const shell = layout.middleware('components/layout.html', '#app', { currentUser, trends });
router.Use(shell);

router.Get('/', Out.component('components/feed.html', { currentUser, tweets }));
router.Get('/explore', Out.component('components/explore.html', { currentUser, tweets, trends }));
router.Get('/profile', Out.component('components/profile.html', { currentUser, tweets }));
router.Get('/tweet/{id}', Out.component('pages/tweet-detail.html', { currentUser, tweets }));

router.NotFound(Out.component('components/404.html'));

on('[data-action]', 'click', (e, el) => {
    const action = el.dataset.action;
    if (!action) return;

    if (action === 'like' || action === 'retweet') {
        const tweetId = el.closest('[data-tweet-id]')?.dataset.tweetId;
        if (!tweetId) return;

        setTweets(tweets().map(t => {
            if (t.id !== tweetId) return t;
            if (action === 'like') return { ...t, likes: t.liked ? t.likes - 1 : t.likes + 1, liked: !t.liked };
            if (action === 'retweet') return { ...t, retweets: t.retweeted ? t.retweets - 1 : t.retweets + 1, retweeted: !t.retweeted };
        }));
    } else if (action === 'reply') {
        const tweetId = el.closest('[data-tweet-id]')?.dataset.tweetId;
        if (tweetId) router.navigate('/tweet/' + tweetId);
    } else if (action === 'share') {
        const tweetId = el.closest('[data-tweet-id]')?.dataset.tweetId;
        if (tweetId) {
            navigator.clipboard.writeText(window.location.origin + window.location.pathname + '#/tweet/' + tweetId);
            notify.success('Link copied to clipboard!');
        }
    } else if (action === 'follow') {
        const isFollowing = el.classList.contains('following');
        if (isFollowing) {
            el.classList.remove('following');
            el.textContent = 'Follow';
            el.style.background = '';
            el.style.color = '';
            el.style.border = '';
            setCurrentUser({...currentUser(), following: currentUser().following - 1});
        } else {
            el.classList.add('following');
            el.textContent = 'Following';
            el.style.background = 'transparent';
            el.style.color = 'var(--text)';
            el.style.border = '1px solid var(--border)';
            setCurrentUser({...currentUser(), following: currentUser().following + 1});
        }
    }
});

on('#search', 'input', debounce((e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) return;

    const count = tweets().filter(t =>
        t.content.toLowerCase().includes(query) ||
        (t.userName || currentUser().name).toLowerCase().includes(query)
    ).length;

    if (count > 0) notify.info(`Found ${count} tweet(s)`);
}, 300));

keys({
    'n'   : () => modal.open('composeModal'),
    'g h' : () => router.navigate('/'),
    'g e' : () => router.navigate('/explore'),
    'g p' : () => router.navigate('/profile'),
    '/'   : () => document.getElementById('search')?.focus(),
    '?'   : () => notify.info('n: Compose · g h: Home · g e: Explore · g p: Profile · /: Search · Esc: Close'),
});

// Live Streaming Simulation
// Generates a new tweet periodically to demonstrate reactivity
const botTweets =[
    "Just discovered Oja's reactive context. Mind blown 🤯",
    "Who needs a virtual DOM anyway? 🚀",
    "Writing raw HTML feels so good again.",
    "The proxy-based props injection in Oja is pure genius.",
    "Is this the end of 10MB JavaScript bundles? 🤔"
];
let botIdx = 0;

setInterval(() => {
    if (botIdx >= botTweets.length) botIdx = 0;

    const newTweet = {
        id: 'live-' + Date.now(),
        userId: 'bot-1',
        userName: 'Oja Bot',
        userUsername: 'ojabot',
        userAvatar: '🤖',
        content: botTweets[botIdx++],
        likes: Math.floor(Math.random() * 50),
        retweets: Math.floor(Math.random() * 10),
        replies: 0,
        timestamp: Date.now(),
        liked: false,
        retweeted: false
    };

    setTweets([newTweet, ...tweets()]);
    notify.info('New tweet from @ojabot');
}, 15000);

router.start('/');