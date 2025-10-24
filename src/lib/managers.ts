
import { MANAGER_TEAMS } from "./admins";
import { USER_DATA_MAP } from "./user-data";

type Manager = {
    uid: string;
    name: string;
}

const getManagerList = (): Manager[] => {
    const managerUids = Object.keys(MANAGER_TEAMS);
    return managerUids.map(uid => {
        const userData = USER_DATA_MAP[uid];
        const name = userData ? `${userData.firstName} ${userData.lastName}` : `Manager (${uid.substring(0, 6)}...)`;
        return { uid, name };
    }).sort((a,b) => a.name.localeCompare(b.name));
}

export const managers = getManagerList();

    