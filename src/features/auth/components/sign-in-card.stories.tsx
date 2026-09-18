import type { Meta, StoryObj } from '@storybook/react-vite';
import { SignInCard } from './sign-in-card';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const meta = {
  title: 'Auth/SignInCard',
  component: SignInCard,
  parameters: { docs: { description: { component: 'Passwordless sign-in card. Step one: bold title, three-line why, optional Google button, email field stacked over a full-width "Email me a code" button. Step two: large centred code field, full-width Sign in, "Use a different email" and coral "Resend code" underneath. Busy text on buttons, inline red errors.' } } },
  args: { onSendCode: async () => wait(600), onVerify: async (_e: string, c: string) => (await wait(600), c === '123456' ? undefined : Promise.reject(new Error('That code did not work. Try 123456.'))) },
  decorators: [S => <div className="w-[372px] bg-canvas p-3"><S /></div>],
} satisfies Meta<typeof SignInCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Email: Story = {};
export const WithGoogle: Story = { args: { onGoogle: async () => alert('google') } };
export const CodeStep: Story = { args: { pendingEmail: 'nick@example.com' } };
export const SendFails: Story = { args: { onSendCode: async () => (await wait(400), Promise.reject(new Error('Too many codes sent. Try again in a minute.'))) } };
