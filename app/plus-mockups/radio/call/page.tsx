// The host's shareable call-in link: opens the radio, starts it and opens the first step.
import { RadioPage } from "../../_ui/radio";

export default function Page() {
  return <RadioPage mode="hosted" step="signin" />;
}
