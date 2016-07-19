'use strict';

/* global requestAnimationFrame, fetch, document, window, Image */

var canvas = document.getElementById('canvas');
var context = canvas.getContext('2d');

var GRAVITY_ACCELERATION = 20;

var CONTROL_NAMES = {
    38: 'UP',
    40: 'DOWN',
    37: 'LEFT',
    39: 'RIGHT'
};

var CONTROLS_PRESSED = {
    UP: false,
    DOWN: false,
    LEFT: false,
    RIGHT: false
};

var RESOURCES = {};

window.addEventListener('keydown', function (e) {
    CONTROLS_PRESSED[CONTROL_NAMES[e.which] || 'ANY'] = true;
});

window.addEventListener('keyup', function (e) {
    CONTROLS_PRESSED[CONTROL_NAMES[e.which] || 'ANY'] = false;
});

function loadImage(url) {
    return new Promise(function (resolve) {
        var img = new Image();
        img.onload = () => resolve(img);
        img.src = url;
    });
}

class Sprite {
    constructor(image, meta, speed) {
        this._image = image;
        this._meta = meta;
        this._speed = speed;
        this._animTime = 0;
    }

    drawFrame(context, frameNum, x, y) {
        var spriteMeta = this._meta[frameNum];
        var sx = spriteMeta.frame.x;
        var sy = spriteMeta.frame.y;
        var sWidth = spriteMeta.frame.w;
        var sHeight = spriteMeta.frame.h;
        var dx = x - parseInt(spriteMeta.pivot.x * sWidth);
        var dy = y - parseInt(spriteMeta.pivot.y * sHeight);

        context.drawImage(this._image, sx, sy, sWidth, sHeight, dx, dy, sWidth, sHeight);
    }

    draw(context, x, y, delta) {
        if (this._meta.length < 2) {
            return this.drawFrame(context, 0, x, y);
        }

        this._animTime += delta;
        var frameNum = parseInt(this._animTime / this._speed) % this._meta.length;
        return this.drawFrame(context, frameNum, x, y);
    }
}

class Vector2d {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(vector) {
        this.x += vector.x;
        this.y += vector.y;
    }

    plus(vector) {
        return new Vector2d(this.x + vector.x, this.y + vector.y);
    }

    sub(vector) {
        this.x -= vector.x;
        this.y -= vector.y;
    }

    minus(vector) {
        return new Vector2d(this.x - vector.x, this.y - vector.y);
    }

    length() {
        return Math.sqrt(this.lengthSqr());
    }

    lengthSqr() {
        return (this.x * this.x + this.y * this.y);
    }

    multiply(a) {
        return new Vector2d(this.x * a, this.y * a);
    }

    dotProduct(vector) {
        return this.x * vector.x + this.y * vector.y;
    }
}

class Vector3d {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    multiply(a) {
        return new Vector3d(this.x * a, this.y * a, this.z * a);
    }

    plus(vector) {
        return new Vector3d(this.x + vector.x, this.y + vector.y, this.z + vector.z);
    }
}

class Box {
    constructor(leftCorner, width, height) {
        this.x = leftCorner.x;
        this.y = leftCorner.y;
        this.width = width;
        this.height = height;
    }

    isIntersects(box) {
        return (Math.abs(this.x - box.x) * 2 < (this.width + box.width)) &&
            (Math.abs(this.y - box.y) * 2 < (this.height + box.height));
    }
 }

class SceneManager {
    constructor(canvas, context) {
        this.actors = [];
        this.viewportOffset = 0;
        this.canvas = canvas;
        this.context = context;
    }

    addActor(actor) {
        this.actors.push(actor);
        actor.scene = this;
    }

    setPlayerActor(actor) {
        this.playerActor = actor;
    }

    setLevel(level) {
        this.level = level;
    }

    update(delta) {
        this.actors.forEach((actor) => actor.update(delta));
    }

    drawStatusBar() {
        this.context.font = '16px prstart';
        this.context.textBaseline = 'top';
        this.context.fillStyle = 'rgb(255, 255, 255)';
        this.context.fillText('MARIO', 10, 13);
        this.context.fillText('000000', 10, 36);
    }

    drawLevel(delta) {
        context.fillStyle = 'rgb(0, 100, 190)';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    draw(delta) {
        this.context.fillStyle = '#5C94FC';
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawStatusBar();
        this.drawLevel(delta);

        this.actors.forEach(
            (actor) => actor.draw(this.context, delta, this.viewportOffset)
        );
    }
}

class Actor {
    constructor(resources, startPosX, startPosY) {
        this.position = new Vector2d(startPosX, startPosY);
        this.speed = new Vector2d(0, 0);
        this.isInAir = true;
        this.isFalling = false;
    }

    applyGravity() {
        if (this.position.y < 480) {
            this.speed.add(new Vector2d(0, GRAVITY_ACCELERATION));
        } else {
            this.position.y = 480;
            this.isFalling = false;
            this.isInAir = false;
            this.speed.y = 0;
            this.isInAir = false;
        }
    }

    update(/* delta */) {
        throw new Error('Not implemented!');
    }

    draw(/* context, delta */) {
        throw new Error('Not implemented!');
    }
}

class Mario extends Actor {
    constructor(resources, startPosX, startPosY) {
        super(resources, startPosX, startPosY);

        this.MAX_SPEED = 300;
        this.ACCELERATION = 15;
        this.MAX_JUMP_SPEED = 2000;
        this.JUMP_ACCELERATION = 600;

        this._sprites = {
            LTR: {
                idle: resources.marioIdleLTR,
                run: resources.marioWalkLTR,
                stopping: resources.marioStoppingLTR,
                jump: resources.marioJumpLTR
            },
            RTL: {
                idle: resources.marioIdleRTL,
                run: resources.marioWalkRTL,
                stopping: resources.marioStoppingRTL,
                jump: resources.marioJumpRTL
            }
        };

        this._direction = 'LTR';
        this._isRunning = false;
        this._isStopping = false;
    }

    update(delta) {
        super.applyGravity();

        if (CONTROLS_PRESSED.LEFT) {
            this._direction = 'RTL';
            if (this.speed.x > -this.MAX_SPEED) {
                this.speed.add({x: -this.ACCELERATION, y: 0});
            }
            if (this.speed.x < -this.MAX_SPEED) {
                this.speed.x = -this.MAX_SPEED;
            }
        }

        if (CONTROLS_PRESSED.RIGHT) {
            this._direction = 'LTR';
            if (this.speed.x < this.MAX_SPEED) {
                this.speed.add({x: this.ACCELERATION, y: 0});
            }
            if (this.speed.x > this.MAX_SPEED) {
                this.speed.x = this.MAX_SPEED;
            }
        }

        if (CONTROLS_PRESSED.UP) {
            if (!this.isFalling && this.speed.y > -this.MAX_JUMP_SPEED) {
                this.speed.add({x: 0, y: -this.JUMP_ACCELERATION});
                this.isInAir = true;
            }
            if (this.speed.y >= -this.MAX_JUMP_SPEED) {
                this.isFalling = true;
            }
        }

        if (!CONTROLS_PRESSED.LEFT && !CONTROLS_PRESSED.RIGHT) {
            if (this.speed.x > -1 && this.speed.x < 1) {
                this.speed.x = 0;
            }
            if (this.speed.x < 0) {
                this.speed.add({x: this.ACCELERATION, y: 0});
            } else if (this.speed.x > 0) {
                this.speed.add({x: -this.ACCELERATION, y: 0});
            }
        }

        this.position.add(this.speed.multiply(delta/1000));

        if (this.position.x - this.scene.viewportOffset < 0) {
            this.position.x = this.scene.viewportOffset;
        }

        this._isRunning =
            (CONTROLS_PRESSED.RIGHT || CONTROLS_PRESSED.LEFT) ||
            this.speed.x !== 0;

        this._isStopping = (this._isRunning) && (
            (this._direction === 'LTR' && this.speed.x < -this.MAX_SPEED * 0.25) ||
            (this._direction === 'RTL' && this.speed.x > this.MAX_SPEED * 0.25)
        );
    }

    draw(context, delta, viewportOffset) {
        var positionX = this.position.x - viewportOffset;
        var positionY = this.position.y;

        if (this.isInAir) {
            return this._sprites[this._direction].jump.draw(
                context,
                positionX, positionY,
                delta
            );
        }

        if (this._isStopping) {
            return this._sprites[this._direction].stopping.draw(
                context,
                positionX, positionY,
                delta
            );
        }

        if (this._isRunning) {
            return this._sprites[this._direction].run.draw(
                context,
                positionX, positionY,
                delta
            );
        }

        this._sprites[this._direction].idle.draw(
            context,
            positionX, positionY,
            delta
        );
    }
}

function loadSpriteSheet(name) {
    return Promise.all([
        loadImage('sprites/' + name + '.png'),
        fetch('sprites/' + name + '.json').then((response) => response.json())
    ]).then(function ([image, meta]) {
        return {
            image: image,
            meta: meta
        };
    });
}

var PREVIOUS_T = 0;
const SCENE = new SceneManager(canvas, context);

function mainLoop(t) {
    let delta = t - PREVIOUS_T;
    PREVIOUS_T = t;

    SCENE.update(delta);
    SCENE.draw(delta);

    requestAnimationFrame(mainLoop);
}

Promise.all([
    loadSpriteSheet('mario-normal'),
]).then(function ([resourceMarioNormal, resourceLevel1_1, resourceTiles]) {
    var marioNormalSheet = resourceMarioNormal;
    var marioMeta = resourceMarioNormal.meta.frames;

    RESOURCES.marioIdleLTR = new Sprite(
        marioNormalSheet.image,
        [marioMeta['mario-idle-ltr']],
        100
    );

    RESOURCES.marioIdleRTL = new Sprite(
        marioNormalSheet.image,
        [marioMeta['mario-idle-rtl']],
        100
    );

    RESOURCES.marioStoppingLTR = new Sprite(
        marioNormalSheet.image,
        [marioMeta['mario-stopping-ltr']],
        100
    );

    RESOURCES.marioStoppingRTL = new Sprite(
        marioNormalSheet.image,
        [marioMeta['mario-stopping-rtl']],
        100
    );

    RESOURCES.marioJumpLTR = new Sprite(
        marioNormalSheet.image,
        [marioMeta['mario-jump-ltr']],
        100
    );

    RESOURCES.marioJumpRTL = new Sprite(
        marioNormalSheet.image,
        [marioMeta['mario-jump-rtl']],
        100
    );

    RESOURCES.marioWalkLTR = new Sprite(
        marioNormalSheet.image,
        [
            marioMeta['mario-walk-ltr0'],
            marioMeta['mario-walk-ltr1'],
            marioMeta['mario-walk-ltr2']
        ],
        100
    );

    RESOURCES.marioWalkRTL = new Sprite(
        marioNormalSheet.image,
        [
            marioMeta['mario-walk-rtl0'],
            marioMeta['mario-walk-rtl1'],
            marioMeta['mario-walk-rtl2']
        ],
        100
    );

    var mario = new Mario(RESOURCES, 100, 100);

    SCENE.addActor(mario);
    SCENE.setPlayerActor(mario);

    requestAnimationFrame(mainLoop);
});
