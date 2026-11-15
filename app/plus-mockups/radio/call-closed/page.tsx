// The call-in link, opened after the host closed calls: the radio just plays.
import { RadioPage } from "../../_ui/radio";

export default function Page() {
  return <RadioPage mode="hosted" step="closed" />;
}
