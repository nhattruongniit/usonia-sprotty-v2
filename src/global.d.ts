declare global {
    interface Window {
        monaco: any;
        require: {
            config: (config: any) => void;
            (modules: string[], callback: (...args: any[]) => void): void;
        };
    }
}
declare module '*.css' {
    const content: string;
    export default content;
}
