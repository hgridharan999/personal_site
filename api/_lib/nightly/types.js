export const TYPES = [
  { key: 'second_order', name: 'Second-order effects', trains: 'Thinking past the headline', example: 'Who quietly wins or loses if this plays out?' },
  { key: 'incentives', name: 'Incentives', trains: 'Reading motives', example: 'Why is this company doing this now?' },
  { key: 'find_flaw', name: 'Find the flaw', trains: 'Skepticism', example: 'What is the weakest claim in this announcement?' },
  { key: 'forecast', name: 'Forecast', trains: 'Calibration', example: 'Give a probability and a date for the outcome.' },
  { key: 'base_rates', name: 'Base rates', trains: 'The outside view', example: 'How often does this kind of deal or launch work?' },
  { key: 'estimate', name: 'Estimate', trains: 'Quantitative sense', example: 'Size the one number that matters, by hand.' },
  { key: 'decide', name: 'Decide', trains: 'Judgment under constraints', example: 'You run this company. What do you do tomorrow?' },
  { key: 'compress', name: 'Compress', trains: 'Clarity', example: 'Explain the story in one sentence to an outsider.' },
  { key: 'case_rep', name: 'Case rep', trains: 'Consulting structure', example: "Build the issue tree for this company's problem." },
];

export const TYPE_KEYS = TYPES.map((t) => t.key);
export const CASE_REP = 'case_rep';
