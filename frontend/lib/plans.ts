export type PlanKey = 'sirius';

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  price: '$6.99';
  desc: string;
  features: string[];
  limited: string[];
  recommended?: boolean;
};

export function getPlans(
  t: (key: string, params?: Record<string, string | number>) => string
): PlanDefinition[] {
  return [
    {
      key: 'sirius',
      name: t('plan.name'),
      price: '$6.99',
      desc: t('plan.description'),
      features: [
        t('plan.features.0'),
        t('plan.features.1'),
        t('plan.features.2'),
        t('plan.features.3'),
        t('plan.features.4'),
        t('plan.features.5'),
        t('plan.features.6'),
      ],
      limited: [],
      recommended: true,
    },
  ];
}

export function getPlanDefinition(
  planKey: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  const plans = getPlans(t);
  return plans.find((plan) => plan.key === planKey) || plans[0];
}
