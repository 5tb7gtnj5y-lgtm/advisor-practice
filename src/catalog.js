export const outcomes = [
  {
    id: "welcome",
    title: "Welcome and explain your role",
    description:
      "Introduce yourself, explain how you can help, and use a professional, approachable tone.",
    weight: 10,
    essential: false,
  },
  {
    id: "privacy",
    title: "Protect customer information",
    description:
      "Follow the fictional identity check before discussing the account; request only the training reference and fictional postcode. Never request a password, bank details or real personal data.",
    weight: 15,
    essential: true,
  },
  {
    id: "discover",
    title: "Understand the customer’s needs",
    description:
      "Use relevant open and follow-up questions, listen to the answers, and confirm the issue and desired result.",
    weight: 20,
    essential: false,
  },
  {
    id: "empathy",
    title: "Show empathy and adapt",
    description:
      "Acknowledge the customer’s concern, avoid judgement and adapt to communication or accessibility needs when revealed.",
    weight: 15,
    essential: false,
  },
  {
    id: "accuracy",
    title: "Give clear, accurate guidance",
    description:
      "Explain the next step using the supplied fictional guidance. Do not invent rules, eligibility, refunds or deadlines; acknowledge what needs checking.",
    weight: 15,
    essential: true,
  },
  {
    id: "action",
    title: "Agree a workable action plan",
    description:
      "Agree specific next steps, who will do them, and how to follow up. Check whether the customer can carry them out.",
    weight: 15,
    essential: false,
  },
  {
    id: "close",
    title: "Check understanding and close",
    description:
      "Summarise the plan, check the customer understands, invite remaining questions and close professionally.",
    weight: 10,
    essential: false,
  },
];
const common =
  "FICTIONAL TRAINING GUIDANCE — not HMRC policy. Before discussing account details, ask for training reference TR-204 and fictional postcode ZZ1 1ZZ. Do not request real identifiers or bank details. You can explain general steps before the check. Never claim to access a live account. Do not guarantee an outcome or timescale. Explain that an authorised team must check the facts. Offer a supported telephone route if an online task is unsuitable. Ask about preferred communication. Summarise next steps and check understanding.";
export const scenarios = [
  {
    id: "letter",
    title: "A confusing tax letter",
    category: "HMRC-style enquiry",
    brief:
      "A customer has received a letter they do not understand. Find out what concerns them and agree a safe next step.",
    guidance:
      common +
      " Ask which part of the letter is unclear. Explain that the amount shown needs checking against the customer’s records. The customer can gather their fictional letter and payslip for an authorised review. You cannot confirm a debt, adjust a tax code or promise a refund. Offer a follow-up through the route on the training letter.",
    customer: "Alex Morgan",
    opening:
      "Hello. I’ve had a tax letter saying I might owe money. I don’t understand it and I’m worried.",
    facts:
      "You are Alex Morgan, a fictional employed customer. Letter says £320 may need reviewing. You changed jobs two months ago. You have two payslips and the letter. You fear paying twice. Only reveal the job change if asked about recent changes. You prefer plain language. Reference TR-204; postcode ZZ1 1ZZ. You have not checked the payslips yet.",
  },
  {
    id: "payment",
    title: "Worried about making a payment",
    category: "HMRC-style support",
    brief:
      "A customer is worried that they cannot afford a requested payment. Explore their situation without making promises.",
    guidance:
      common +
      " Ask what has changed and whether the customer can manage essential living costs. Explain that a specialist payment-support team can review available arrangements, subject to the relevant checks. Do not promise a payment plan, interest pause or write-off. Do not ask for bank or card details. Agree how the customer will contact the specialist team using the training letter’s contact route.",
    customer: "Sam Patel",
    opening:
      "I’m calling about a payment letter. There’s no way I can pay it all at once.",
    facts:
      "You are Sam Patel, a fictional self-employed customer. The training letter mentions £450. Work has reduced recently, you are behind on household bills and you are anxious about being judged. Reveal essential-cost difficulty when asked sensitively. You can make calls after 3 pm. You do not want to discuss bank details. Reference TR-204; postcode ZZ1 1ZZ.",
  },
  {
    id: "online",
    title: "Unable to use an online service",
    category: "Public-service accessibility",
    brief:
      "A customer cannot complete an online task. Identify the barrier and help them find a suitable route.",
    guidance:
      common +
      " Ask what stage the customer has reached and what support they prefer. Never request a password or one-time security code. Do not assume access to another person’s device. Offer an authorised supported telephone route or an accessible alternative through the training service. Agree a way to continue that suits the customer.",
    customer: "Jamie Ellis",
    opening:
      "Your website keeps sending me round in circles. I just need someone to help me do this.",
    facts:
      "You are Jamie Ellis, a fictional customer. You are using an old phone. You struggle to read small text and are embarrassed. Reveal reading difficulty if the advisor asks sensitively about what makes the task hard or preferred support. You would rather speak to someone. You have tried twice. Reference TR-204; postcode ZZ1 1ZZ.",
  },
  {
    id: "complaint",
    title: "An unresolved service complaint",
    category: "Public-service complaint",
    brief:
      "A customer has contacted the service twice without a clear answer. Acknowledge the experience and agree the next step.",
    guidance:
      common +
      " Ask what happened and what resolution the customer wants. Acknowledge the experience without blaming staff. Explain that the authorised complaints team can review the history. Do not promise compensation, priority handling or a response date. Agree how to provide a concise summary and use the complaints contact route on the training service page.",
    customer: "Taylor Reed",
    opening:
      "This is the third time I’ve contacted you. Nobody tells me what’s happening. I’m fed up.",
    facts:
      "You are Taylor Reed, a fictional customer. You submitted a form three weeks ago and contacted the service twice. You were told someone would check it, with no specific date. You want acknowledgement and a clear owner, not money. You have the submission reference. You care for a relative and have limited time. Reference TR-204; postcode ZZ1 1ZZ.",
  },
];
export const levels = {
  foundation:
    "Cooperative customer. Give straightforward answers to relevant questions. Use plain language. Do not volunteer all hidden facts immediately.",
  intermediate:
    "Concerned customer. Reveal one relevant fact at a time when asked. Ask one natural clarification if the explanation is vague. Become calmer when heard.",
  advanced:
    "Frustrated or anxious customer with the barriers in your profile. Challenge vague assurances, ask a plausible follow-up, and reveal hidden facts only when explored. Remain realistic and civil; good empathy and a workable plan reduce frustration.",
};
export function publicScenario(s) {
  const {
    facts,
    background,
    personality,
    emotionalState,
    hiddenInformation,
    concerns,
    complications,
    desiredOutcome,
    ...visible
  } = s;
  return visible;
}
