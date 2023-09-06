import { Store } from "./store";
import { UserStore } from "./userStore";
import { Restrict } from "./restrict";

const credentialStore = new Store();
credentialStore.writeEntries({ username: "user1" });

export class AdminStore extends Store {
  @Restrict("r")
  public user: UserStore;
  @Restrict()
  name: string = "John Doe";
  @Restrict("rw")
  getCredentials = (): Store => {
    return credentialStore;
  };

  constructor(user: UserStore) {
    super();
    this.defaultPolicy = "none";
    this.user = user;
  }
}
