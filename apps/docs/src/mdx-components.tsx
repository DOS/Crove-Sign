import * as TabsComponents from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { EnvelopeWarning } from '@/components/mdx/envelope-warning';
import { Mermaid } from '@/components/mdx/mermaid';

// biome-ignore lint/suspicious/noExplicitAny: MDX component map typing mirrors upstream documenso
export function getMDXComponents(components?: MDXComponents): any {
  return {
    ...defaultMdxComponents,
    ...TabsComponents,
    Mermaid,
    EnvelopeWarning,
    ...components,
  };
}
