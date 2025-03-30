import { ElementNode } from './ElementNode';

export default interface BookData {
    basePath: string;
    path: string;
    navMap: any;
    language: string;
    content?: ElementNode[]; // Array of parsed ElementNodes representing the entire book
}