export function scoreResult(
  agent: { component: string; category: string },
  truth: { component: string; category: string }
): 'correct' | 'partial' | 'wrong' {
  const componentMatch = agent.component === truth.component;
  const categoryMatch = agent.category === truth.category;

  if (componentMatch && categoryMatch) {
    return 'correct';
  }
  if (componentMatch && !categoryMatch) {
    return 'partial';
  }
  return 'wrong';
}
