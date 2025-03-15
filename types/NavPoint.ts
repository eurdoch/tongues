export type NavPoint = {
    id: string;
    playOrder: string;
    label: string;
    src: string;
    children: NavPoint[];
  };