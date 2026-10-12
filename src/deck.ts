/**
 * The deck. `{name}` marks a card that is about another player — the game
 * fills it in with a fairly rotated target.
 *
 * Kinds decide who speaks. Nobody answers their own draw:
 *   guess — the active player guesses about the target, who then reveals the truth
 *   self  — a question about "you": the drawer reads it to the target, who answers
 *   ask   — the active player speaks to (or asks) the target
 *   group — everyone takes part
 */
export type Kind = 'guess' | 'self' | 'ask' | 'group'

export interface Prompt {
  id: string
  kind: Kind
  text: string
}

export interface Arcanum {
  numeral: string
  title: string
  theme: string
  blurb: string
}

/** Which card-back sigil a level's face-down cards show. */
export type Sigil = 'fool' | 'lovers' | 'star'

export const LEVELS: (Arcanum & { sigil: Sigil })[] = [
  {
    numeral: '0',
    title: 'The Fool',
    sigil: 'fool',
    theme: 'Perception',
    blurb: 'Begin with first impressions. Guess boldly, then find out how close you came.',
  },
  {
    numeral: 'VI',
    title: 'The Lovers',
    sigil: 'lovers',
    theme: 'Connection',
    blurb: 'Go beneath the surface. Answer honestly, listen generously.',
  },
  {
    numeral: 'XVII',
    title: 'The Star',
    sigil: 'star',
    theme: 'Revelation',
    blurb: 'The deepest water. Say what you rarely say out loud, and hold what you are given with care.',
  },
]

export const WILD: Arcanum = {
  numeral: 'X',
  title: 'Wheel of Fortune',
  theme: 'Wildcard',
  blurb: 'Everyone plays.',
}

export const OBLIQUE: Arcanum = {
  numeral: 'XII',
  title: 'The Hanged Man',
  theme: 'Oblique',
  blurb: 'Come at it sideways.',
}

export const CLOSING: Arcanum = {
  numeral: 'XIX',
  title: 'The Sun',
  theme: 'Closing',
  blurb:
    'Go around the circle. Each person tells the player on their left one thing they appreciate about them.',
}

export const FINALE: Arcanum = {
  numeral: 'XXI',
  title: 'The World',
  theme: 'Complete',
  blurb: 'The reading is over.',
}

const mk = (prefix: string, kind: Kind, texts: string[]): Prompt[] =>
  texts.map((text, i) => ({ id: `${prefix}-${kind}-${i}`, kind, text }))

const perception = mk('I', 'guess', [
  'What do you think {name} was like at fifteen?',
  "What do you think {name}'s first job was?",
  'What do you guess {name} orders at a café without looking at the menu?',
  'What kind of music do you think {name} listens to when they are alone?',
  'What do you think {name} is secretly good at?',
  'If {name} had a completely different career, what would it be?',
  "What do you think {name}'s childhood bedroom looked like?",
  'Is {name} a morning person or a night person? What gives it away?',
  'What do you think {name} spends too much money on?',
  "Describe {name}'s energy in three words.",
  'What do you think {name} got told off for most as a kid?',
  'Which fictional character do you think {name} relates to?',
  'What would {name} do with a completely free, unplanned Saturday?',
  'Is {name} the friend who gives advice, or the one who asks for it?',
  'What do you think {name} is proud of but rarely mentions?',
  'Where in the world do you think {name} feels most at home?',
  'What would {name} be famous for?',
  'What do you think {name} finds hardest to say no to?',
  'What was {name} like as the new kid at school?',
  "What do you think {name}'s love language is?",
  'What would {name} title their autobiography?',
  'Which decade do you think {name} would have thrived in?',
  'What do you think {name} is like when they are stressed?',
  'What pet do you think {name} had — or wanted — growing up?',
  'What do you think {name} worries about that nobody would guess?',
  'Do you think {name} keeps a tidy home? What makes you say that?',
  'What do you think {name} was obsessed with as a child?',
  'What do you think {name} would never, ever eat?',
    'What do you think {name} would do if they found £50 on the floor of an empty room?',
    "What do you think {name}'s search history looked like at 2am this week?",
    'What do you think {name} does in the five minutes after walking in the door alone?',
    "What rule do you think {name} secretly thinks doesn't apply to them?",
    'If {name} were a haunted house, what would the ghost be mad about?',
    'What do you think {name} rehearses in the shower?',
    'What do you think {name} was the last person to find out about?',
    "What do you think {name}'s villain origin story would be?",
    "Which household appliance has {name}'s energy?",
    'What do you think {name} is a terrible judge of?',
])

const connection = [
  ...mk('II', 'self', [
    "What's something you've changed your mind about in the last year?",
    'When did you last feel truly proud of yourself?',
    'What compliment have you received that you still think about?',
    'What do you wish someone had told you at eighteen?',
    'What are you currently pretending not to care about?',
    'What does a perfect ordinary day look like for you?',
    "Name a fear you've outgrown — and one you haven't.",
    'Who in your life do you most want to make proud?',
    "What's the kindest thing a stranger has done for you?",
    'What part of yourself are you still learning to accept?',
    'When do you feel most like yourself?',
    "What's a small thing that makes you irrationally happy?",
    'What did your family get right, and what did they get wrong?',
    'What are you quietly working towards?',
    "What's a memory you'd relive exactly as it happened?",
    'What do you need more of in your life right now?',
    "What's a lesson you keep having to relearn?",
    'What question do you wish people asked you more often?',
    "What's the hardest goodbye you've ever had to say?",
    "What are you grateful for this year that you haven't said out loud?",
    'What does friendship ask of you that you find difficult?',
    'What do you believe that most people here might not?',
      "What's a belief you hold mostly because of one person?",
    "What's something you were wrong about for an embarrassingly long time?",
    "What's a thing you do only when nobody is watching?",
    "What do you think you'd be like if you'd been born ten years earlier?",
    "What's a conversation you keep having in your head that you've never had out loud?",
    "What's the smallest thing that has ever made you cry?",
    "What's a compliment you'd be suspicious of?",
    "What do people get wrong about you in a way you've stopped correcting?",
]),
  ...mk('II', 'ask', [
    "Ask {name} a question you've wanted to ask but haven't.",
    'What do you think you and {name} have in common that nobody would notice?',
    "Ask {name}: what's been on your mind lately?",
    'What would you most want to learn from {name}?',
    'What do you think {name} needs to hear right now?',
    'Tell {name} about a moment you felt you understood them better.',
      "Tell {name} something you've assumed about them without ever checking.",
    "Ask {name} what they'd want this group to argue about on their behalf.",
]),
]

const revelation = [
  ...mk('III', 'self', [
    "What's something you've never fully forgiven yourself for?",
    'When have you felt most alone, and what got you through it?',
    'What do you think you will regret most if nothing changes?',
    'What did you lose that shaped who you are now?',
    "Who do you owe an apology you haven't given?",
    "What part of your parents do you see in yourself that you didn't choose?",
    'What are you afraid people would think if they really knew you?',
    'How has what you need from love changed since you were younger?',
    'When did you last cry, and what was underneath it?',
    "What's a version of your life you quietly mourn?",
    'What do you want the people closest to you to remember you for?',
    "What's the hardest thing you've ever had to accept?",
    'Which relationship in your life do you most wish were different?',
    "What are you still carrying that you'd like to put down?",
    'When were you at your worst, and what did it teach you?',
    'What do you find hard to ask for, even from people who love you?',
    'What do you believe happens when we die — and does it comfort you?',
    'When did you realise you were no longer a child?',
    "If you could have one more conversation with someone you've lost, what would you say?",
    "What story do you tell yourself about why something hasn't worked out?",
    'Where in your life are you settling?',
    'What would your younger self be most disappointed by, and most proud of?',
    "What do you need to hear from someone that you've never heard?",
    'What scares you about the next ten years?',
    'What part of yourself do you hide, even from close friends?',
    'When did you last feel truly understood, and by whom?',
    "What do you wish you could say to your parents but haven't?",
    "What's a promise to yourself you keep breaking?",
    'What makes you feel hard to love, on the bad days?',
    'What would you do differently if you knew you had five years left?',
    'Who here reminds you of someone important in your life, and why?',
  ]),
  ...mk('III', 'ask', [
    "Tell {name} something you admire about them that you've never said out loud.",
    "Ask {name}: what's the hardest thing you're dealing with right now that most people don't know about?",
    'Tell {name} what you think they are more capable of than they believe.',
    'Ask {name}: what do you need from the people in this room?',
    "Tell {name} what you think they carry that they don't talk about. They may confirm, deny or stay silent.",
    "Ask {name}: what's something you're afraid to want?",
    'Ask {name} who they would call at 3am, and why that person.',
    'Tell {name} what you hope for them in the next year.',
    'Ask {name}: what part of your life feels unfinished?',
    'Ask {name}: what would you change about how you were loved as a child?',
    'What do you think {name} is about to grow into? Tell them.',
    "Ask {name}: when did you last feel proud of who you are, not what you've done?",
  ]),
]

export const DECK: Prompt[][] = [perception, connection, revelation]

export const WILDCARDS: Prompt[] = [
  ...mk('W', 'group', [
    'On the count of three, everyone points to who they would call in a crisis.',
    'Everyone: show your most-used emoji and explain it.',
    'Everyone describes the person on their left in one word.',
    'Go around: what was the best thing that happened to you this week?',
    'Everyone: find a photo in your camera roll from around a year ago and share the story.',
    'On three, everyone points to who is most likely to cry at a wedding.',
    'Everyone: name a song that reminds you of a specific person.',
    'Go around: what skill could you teach this group in an afternoon?',
    'Everyone: what are you looking forward to right now?',
    'On three, everyone points to who they would trust to plan their surprise party.',
    'Everyone finishes the sentence: “I feel most at peace when…”',
    'Decide together: what should this group do together next?',
      'On three, everyone points to who would survive longest in a period drama.',
    'Everyone: say the last lie you told. Small ones count.',
    "Go around: what's the pettiest hill you'd die on?",
    "Everyone names the group's collective weakness. Vote on the winner.",
    'On three, everyone points to who would be the hardest to buy a present for.',
]),
  ...mk('W', 'ask', [
    'Ask {name} any question you like. They may pass for free.',
    'Hold eye contact with {name} for ten seconds. No talking.',
    'Give {name} a genuine compliment — then they give one back.',
  ]),
]

/**
 * Oblique cards, loosely after Oblique Strategies: a sideways instruction
 * rather than a question. Rare, and only once the group has warmed up
 * (The Lovers onward).
 */
export const OBLIQUES: Prompt[] = [
  ...mk('O', 'self', [
    'Describe the person you were ten years ago as if they were a stranger you once met.',
    'Describe your week as weather.',
    'Take the quality you like least in yourself. Where has it served you well?',
    'Treat a mistake you made this year as a hidden intention. What were you really trying to do?',
    'Name a question you hope nobody ever asks you. Answer it, or say why not.',
    'Describe what you want without naming it. Give its outline, its weight, its colour.',
    'Give yourself the advice you would never give anyone else.',
    'Pick an ordinary object within reach. Let it explain your current state of mind.',
    'Describe a feeling you do not have a word for.',
    'Say something true, at half speed.',
    'What are you good at that you would rather not be needed for?',
    'Tell a story you usually tell well — from the embarrassing angle.',
    'Take a strong opinion you hold. Argue the other side as if you meant it.',
    'Describe the place you grew up through one smell, one sound and one rule.',
    'Describe your current problem as a recipe.',
    "Say what you're avoiding, in the form of a weather forecast.",
    "Name something you've been calling a preference that is actually a fear.",
]),
  ...mk('O', 'ask', [
    'Tell the group how {name} would describe you. Then {name} corrects the record.',
    'Say what you think {name} finds hardest to say out loud. They may confirm, deny or stay silent.',
    'Ask {name} the question you would want to be asked if you were them.',
    'Reverse: {name} asks you a question. You may only answer with a story.',
    'Reverse: {name} tells you what they think you need to hear right now.',
  ]),
  ...mk('O', 'group', [
    'One minute of silence, timed. Then everyone says one word about what it was like.',
    'Go around: name one person, not here, who made you who you are — and something you never thanked them for.',
    'Go around: say one thing you are quietly afraid of. No discussion until everyone has spoken.',
  ]),
]
