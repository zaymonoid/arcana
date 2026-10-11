/**
 * The deck. `{name}` marks a card that is about another player — the game
 * fills it in with a fairly rotated target.
 *
 * Kinds decide who speaks:
 *   guess — the active player guesses about the target, who then reveals the truth
 *   self  — the active player answers about themselves
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

export const LEVELS: Arcanum[] = [
  {
    numeral: '0',
    title: 'The Fool',
    theme: 'Perception',
    blurb: 'Begin with first impressions. Guess boldly, then find out how close you came.',
  },
  {
    numeral: 'VI',
    title: 'The Lovers',
    theme: 'Connection',
    blurb: 'Go beneath the surface. Answer honestly, listen generously.',
  },
  {
    numeral: 'XVII',
    title: 'The Star',
    theme: 'Reflection',
    blurb: 'Look back at tonight and at each other. Say what you noticed.',
  },
]

export const WILD: Arcanum = {
  numeral: 'X',
  title: 'Wheel of Fortune',
  theme: 'Wildcard',
  blurb: 'Everyone plays.',
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
  "What do you think is on {name}'s phone lock screen?",
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
  ]),
  ...mk('II', 'ask', [
    "Ask {name} a question you've wanted to ask but haven't.",
    'What do you think you and {name} have in common that nobody would notice?',
    "Ask {name}: what's been on your mind lately?",
    'What would you most want to learn from {name}?',
    'What do you think {name} needs to hear right now?',
    'Tell {name} about a moment you felt you understood them better.',
  ]),
]

const reflection = [
  ...mk('III', 'ask', [
    "What's something you've learned about {name} tonight?",
    'What did {name} say tonight that surprised you?',
    "What do you think {name}'s greatest strength is?",
    'What should {name} give themselves more credit for?',
    'If you could give {name} one piece of encouragement, what would it be?',
    "What's one thing about {name} you hope never changes?",
    'What do you think {name} is about to grow into?',
    'Which of your first impressions of {name} was wrong?',
    "What would you thank {name} for, if it didn't feel awkward?",
    "What's a question you'd still like {name} to answer?",
    'What do you admire about how {name} answered tonight?',
    'What does {name} bring to this group that nobody else does?',
  ]),
  ...mk('III', 'self', [
    'Which of your answers tonight do you want to expand on?',
    "What's something you've been holding back tonight?",
    'Who here reminds you of someone important in your life, and why?',
    'What has this conversation made you think about?',
    'What do you hope this group remembers about you?',
    'What promise do you want to make to yourself after tonight?',
    'Which question tonight was hardest for you, and why?',
    'What do you want to say to the group before we finish?',
  ]),
]

export const DECK: Prompt[][] = [perception, connection, reflection]

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
  ]),
  ...mk('W', 'ask', [
    'Ask {name} any question you like. They may pass for free.',
    'Hold eye contact with {name} for ten seconds. No talking.',
    'Give {name} a genuine compliment — then they give one back.',
  ]),
]
