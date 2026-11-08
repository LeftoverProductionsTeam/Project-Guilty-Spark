import {expect,it} from 'vitest';
import {windowUiScale} from './uiScale';
it('adapts to window and fullscreen dimensions without exceeding a usable layout',()=>{
 expect(windowUiScale(null,1500,950)).toBe(1);expect(windowUiScale(null,1920,1080)).toBe(1.14);
 expect(windowUiScale(null,5120,1440)).toBe(1.5);expect(windowUiScale(null,800,600)).toBe(.8);
 expect(windowUiScale(1.5,800,600)).toBe(1);expect(windowUiScale(.75,1920,1080)).toBe(.75);
 expect(windowUiScale(1.5,0,0)).toBe(1);
});
