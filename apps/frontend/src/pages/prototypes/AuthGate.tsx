import { LoginScreen } from './AuthScreens';
import { ProtoIndex } from './ProtoIndex';

/** The two screens that draw without the shell. */
export function AuthScreensGate({ index = false }: { index?: boolean }) {
  return index ? <ProtoIndex /> : <LoginScreen />;
}
