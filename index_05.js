'use strict';

/* global requestAnimationFrame, fetch, document, window, Image */

var canvas = document.getElementById('canvas');
var context = canvas.getContext('2d');
var overlayCanvas = document.getElementById('overlay-canvas');
var overlayContext = overlayCanvas.getContext('2d');
var webglCanvas = document.getElementById('webgl-canvas');
var webglContext = webglCanvas.getContext('webgl') || webglCanvas.getContext('experimental-webgl');

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
        if ((this.playerActor.position.x - this.viewportOffset > this.canvas.width / 2) &&
            (this.level.length * 32 - this.viewportOffset >= this.canvas.width)) {
            this.viewportOffset = this.playerActor.position.x - this.canvas.width / 2;
        }

        var xStart = Math.max(calculateWorldPosition({x: 0, y: 0}, this.viewportOffset).x - 5, 0);

        for (var x = xStart; x < xStart + Math.min(32, this.level.length - xStart); x++)
            for (var y = 0; y < 15; y++) {
                if (this.level[x][y] !== ' ') {
                    var screenCoords = calculateScreenCoords({x: x, y: y}, this.viewportOffset);
                    RESOURCES.tiles[parseInt(this.level[x][y], 32)].draw(
                        this.context,
                        screenCoords.x, screenCoords.y,
                        delta
                    );
                }
            }
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
        var collision = this.checkLevelCollision(RESOURCES.level1_1.tiles);
        if (collision === 0) {
            this.speed.add(new Vector2d(0, GRAVITY_ACCELERATION));
        } else {
            this.position.y = this.position.y - collision;
            this.isFalling = false;
            this.isInAir = false;
            this.speed.y = 0;
            this.isInAir = false;
        }
    }

    checkLevelCollision(level) {
        var position = this.position.plus(new Vector2d(-this.scene.viewportOffset, 0));
        var worldPosition = calculateWorldPosition(position, this.scene.viewportOffset);
        var direction = new Vector2d(0, -1);

        var boundingBox = new Box(
            this.position.plus(new Vector2d(-16, -32)),
            32,
            32
        );

        var potentialBoxes = [
            worldPosition.plus(new Vector2d(-1, 0)),
            worldPosition,
            worldPosition.plus(new Vector2d(1, 0)),
            worldPosition.plus(direction).plus(new Vector2d(-1, 0)),
            worldPosition.plus(direction),
            worldPosition.plus(direction).plus(new Vector2d(1, 0))
        ].filter(
            (position) => level[position.x] &&
                level[position.x][position.y] &&
                ['0', '1', '2', 'b'].indexOf(level[position.x][position.y]) > -1
        ).map(
            (position) => new Box(calculatePixelCoords(position), 32, 32)
        );

        var collidedBoxes = potentialBoxes.filter(boundingBox.isIntersects.bind(boundingBox));

        if (collidedBoxes.length > 0) {
            return boundingBox.y + boundingBox.height - collidedBoxes[0].y;
        }

        return 0;
    }

    update(/* delta */) {
        throw new Error('Not implemented!');
    }

    draw(/* context, delta */) {
        throw new Error('Not implemented!');
    }
}

function calculateWorldPosition(screenCoords, viewportOffset) {
    return new Vector2d(
        Math.ceil((screenCoords.x + viewportOffset) / 32) - 1,
        15 - Math.ceil(screenCoords.y / 32)
    );
}

function calculateScreenCoords(worldPosition, viewportOffset) {
    return new Vector2d(
        worldPosition.x * 32 - viewportOffset,
        480 - (worldPosition.y + 1) * 32
    );
}

function calculatePixelCoords(levelPosition) {
    return new Vector2d(
        levelPosition.x * 32,
        480 - (levelPosition.y + 1) * 32
    );
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

function loadLevel(name) {
    return fetch('levels/' + name + '.json')
        .then((response) => response.json());
}

function drawDebugInfo(canvas, context, delta) {
    context.font = '16px monospace';
    context.fillStyle = 'rgba(255, 255, 255, 0.5)';
    var s = 'FPS: ' + (1000/delta).toFixed(2);
    context.fillText(s, 0, 13);
}

function prepareOverlayCanvas(canvas, context) {
    var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    var data = imageData.data;

    for (var i = 0; i < data.length; i += 4) {
        var y = ((i / 4) / canvas.width) | 0;
        var interlaceColor = (y % 4 === 0 || (y - 1) % 4 === 0) ? 255 : 0;
        data[i] = interlaceColor;
        data[i + 1] = interlaceColor;
        data[i + 2] = interlaceColor;
        data[i + 3] = 50;
    }

    context.putImageData(imageData, 0, 0);
}

function postprocess(canvas, context, overlayCanvas) {
    context.globalCompositeOperation = 'multiply';
    context.drawImage(overlayCanvas, 0, 0);
    context.globalCompositeOperation = 'source-over';
}

function postprocessNaive(canvas, context) {
    var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    var data = imageData.data;

    for (var i = 0; i < data.length; i += 4) {
        var y = ((i / 4) / canvas.width) | 0;
        var interlaceColor = (y % 4 === 0 || (y - 1) % 4 === 0) ? 1 : 0;
        var alpha = 0.85;
        var color = new Vector3d(
            data[i],
            data[i+1],
            data[i+2]
        );

        var newColor = color.multiply(interlaceColor);
        var result = color
            .multiply(alpha)
            .plus(
                newColor.multiply(1 - alpha)
            );

        data[i] = result.x;
        data[i + 1] = result.y;
        data[i + 2] = result.z;
    }

    context.putImageData(imageData, 0, 0);
}

var GL_TIME_UNIFORM = null;

function prepareWebGL(canvas, gl, sourceCanvas) {
    var program = gl.createProgram();

    var vertexCode = 'attribute vec2 coordinates;' +
        'attribute vec2 texture_coordinates;' +
        'varying vec2 v_texcoord;' +
        'void main() {' +
        '  gl_Position = vec4(coordinates,0.0, 1.0);' +
        '  v_texcoord = texture_coordinates;' +
        '}';

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexCode);
    gl.compileShader(vertexShader);

    var fragmentCode = 'precision mediump float;' +
        'varying vec2 v_texcoord;' +
        'uniform sampler2D u_texture;' +
        'uniform float u_time;' +
        'float rand(vec2 co){' +
        '   return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);' +
        '}' +
        'void main() {' +
        '   gl_FragColor = texture2D(u_texture, v_texcoord) * .8 + texture2D(u_texture, v_texcoord) * rand(v_texcoord * u_time) * .2;' +
        '}';

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentCode);
    gl.compileShader(fragmentShader);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    gl.linkProgram(program);
    gl.useProgram(program);

    var positionLocation = gl.getAttribLocation(program, 'coordinates');
    var texcoordLocation = gl.getAttribLocation(program, 'texture_coordinates');
    GL_TIME_UNIFORM = gl.getUniformLocation(program, 'u_time');

    var buffer = gl.createBuffer();
    var vertices = [
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1
    ];
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    buffer = gl.createBuffer();
    var textureCoordinates = [
        0, 1,
        1, 1,
        0, 0,
        0, 0,
        1, 1,
        1, 0
    ];
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(texcoordLocation);
    gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

var GL_TIME = 0;

function postprocessWebGL(canvas, gl, sourceCanvas, delta) {
    GL_TIME += delta;
    gl.uniform1f(GL_TIME_UNIFORM, GL_TIME / 1000);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

var PREVIOUS_T = 0;
const SCENE = new SceneManager(canvas, context);

function mainLoop(t) {
    let delta = t - PREVIOUS_T;
    PREVIOUS_T = t;

    SCENE.update(delta);
    SCENE.draw(delta);

    // postprocessNaive(canvas, context, overlayCanvas);
    postprocess(canvas, context, overlayCanvas);
    postprocessWebGL(webglCanvas, webglContext, canvas, delta);

    // drawDebugInfo(canvas, context, delta);
    requestAnimationFrame(mainLoop);
}

Promise.all([
    loadSpriteSheet('mario-normal'),
    loadLevel('level1_1'),
    loadSpriteSheet('tiles'),
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

    RESOURCES.level1_1 = resourceLevel1_1;

    SCENE.setLevel(RESOURCES.level1_1.tiles);

    var tilesSheet = resourceTiles;
    var tilesMeta = resourceTiles.meta.frames;

    RESOURCES.tiles = [
        // 0
        new Sprite(
            tilesSheet.image,
            [tilesMeta.floor],
            0
        ),
        // 1
        new Sprite(
            tilesSheet.image,
            [tilesMeta.platform_brick],
            0
        ),
        // 2
        new Sprite(
            tilesSheet.image,
            [tilesMeta.platform_cube],
            0
        ),
        // 3
        new Sprite(
            tilesSheet.image,
            [tilesMeta.hill_big],
            0
        ),
        // 4
        new Sprite(
            tilesSheet.image,
            [tilesMeta.hill_small],
            0
        ),
        // 5
        new Sprite(
            tilesSheet.image,
            [tilesMeta.bush1],
            0
        ),
        // 6
        new Sprite(
            tilesSheet.image,
            [tilesMeta.bush2],
            0
        ),
        // 7
        new Sprite(
            tilesSheet.image,
            [tilesMeta.bush3],
            0
        ),
        // 8
        new Sprite(
            tilesSheet.image,
            [tilesMeta.cloud1],
            0
        ),
        // 9
        new Sprite(
            tilesSheet.image,
            [tilesMeta.cloud2],
            0
        ),
        // a
        new Sprite(
            tilesSheet.image,
            [tilesMeta.cloud3],
            0
        ),
        // b
        new Sprite(
            tilesSheet.image,
            [
                tilesMeta.sign_0,
                tilesMeta.sign_1,
                tilesMeta.sign_2,
            ],
            1000
        ),
    ];

    var mario = new Mario(RESOURCES, 100, 100);

    SCENE.addActor(mario);
    SCENE.setPlayerActor(mario);

    prepareOverlayCanvas(overlayCanvas, overlayContext);
    prepareWebGL(webglCanvas, webglContext, canvas);

    context.imageSmoothingEnabled = false;

    requestAnimationFrame(mainLoop);
});
